from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionProgressClaim(models.Model):
    """Interim Payment Certificate (IPC): certifies cumulative work done from
    the BOQ, withholds retention (percent, capped), and raises a customer
    invoice for the net amount due this period."""

    _name = "construction.progress.claim"
    _description = "Progress Claim / IPC"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "IPC"
    _order = "project_id, sequence_no"

    name = fields.Char(default=lambda self: self.env._(
        "Interim Payment Certificate"))
    sequence_no = fields.Integer(string="IPC No.", readonly=True, copy=False)
    boq_id = fields.Many2one(
        "construction.boq", required=True,
        domain="[('project_id', '=', project_id), ('state', '!=', 'draft')]")
    currency_id = fields.Many2one(related="boq_id.currency_id", store=True)
    date_from = fields.Date(string="Period From")
    date_to = fields.Date(string="Period To", default=fields.Date.context_today)
    previous_claim_id = fields.Many2one("construction.progress.claim",
                                        readonly=True)
    line_ids = fields.One2many("construction.progress.claim.line", "claim_id")
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("certified", "Certified"), ("invoiced", "Invoiced"),
         ("paid", "Paid")],
        default="draft", tracking=True)
    move_id = fields.Many2one("account.move", readonly=True, copy=False)
    move_payment_state = fields.Selection(
        related="move_id.payment_state", string="Invoice Payment")

    retention_percent = fields.Float()
    retention_cap_percent = fields.Float(string="Retention Cap (% contract)")
    amount_contract = fields.Monetary(related="boq_id.amount_sell_total")
    # These read the previous claim's own computed amounts, so the compute is
    # recursive across previous_claim_id and must be flagged as such.
    amount_work_done_cumulative = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Work Done (Cumulative)")
    amount_work_done_previous = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Previously Certified")
    amount_this_period = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Work This Period")
    retention_cumulative = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Retention (Cumulative)")
    retention_this = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Retention This Period")
    amount_net_cumulative = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    amount_due = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Net Amount Due")

    @api.depends(
        "line_ids.amount_cumulative", "retention_percent",
        "retention_cap_percent", "amount_contract",
        "previous_claim_id.amount_work_done_cumulative",
        "previous_claim_id.retention_cumulative")
    def _compute_amounts(self):
        for claim in self:
            cumulative = sum(claim.line_ids.mapped("amount_cumulative"))
            previous = claim.previous_claim_id.amount_work_done_cumulative
            claim.amount_work_done_cumulative = cumulative
            claim.amount_work_done_previous = previous
            claim.amount_this_period = cumulative - previous
            cap = claim.amount_contract * claim.retention_cap_percent / 100.0
            retention = min(cumulative * claim.retention_percent / 100.0, cap) \
                if claim.retention_cap_percent else \
                cumulative * claim.retention_percent / 100.0
            claim.retention_cumulative = retention
            claim.retention_this = retention - \
                claim.previous_claim_id.retention_cumulative
            claim.amount_net_cumulative = cumulative - retention
            prev_net = (claim.previous_claim_id.amount_work_done_cumulative
                        - claim.previous_claim_id.retention_cumulative)
            claim.amount_due = claim.amount_net_cumulative - prev_net

    @api.model_create_multi
    def create(self, vals_list):
        claims = super().create(vals_list)
        for claim in claims:
            previous = self.search(
                [("project_id", "=", claim.project_id.id),
                 ("boq_id", "=", claim.boq_id.id), ("id", "!=", claim.id)],
                order="sequence_no desc", limit=1)
            claim.previous_claim_id = previous
            claim.sequence_no = (previous.sequence_no or 0) + 1
            if not claim.retention_percent:
                claim.retention_percent = claim.project_id.retention_percent
            if not claim.retention_cap_percent:
                claim.retention_cap_percent = \
                    claim.project_id.retention_cap_percent
            if claim.boq_id and not claim.line_ids:
                claim._populate_lines()
        return claims

    def _populate_lines(self):
        self.ensure_one()
        self.line_ids.unlink()
        prev_lines = {
            l.boq_line_id.id: l for l in self.previous_claim_id.line_ids}
        vals = []
        for boq_line in self.boq_id.line_ids:
            prev = prev_lines.get(boq_line.id)
            vals.append({
                "claim_id": self.id,
                "boq_line_id": boq_line.id,
                "qty_previous": prev.qty_cumulative if prev else 0.0,
            })
        self.env["construction.progress.claim.line"].create(vals)

    def action_load_lines(self):
        self._populate_lines()

    def action_submit(self):
        self.filtered(lambda c: c.state == "draft").state = "submitted"

    def action_certify(self):
        for claim in self:
            if claim.state != "submitted":
                raise UserError(self.env._(
                    "Only submitted claims can be certified."))
            for line in claim.line_ids:
                line.boq_line_id.qty_certified = line.qty_cumulative
            claim.state = "certified"

    def action_create_invoice(self):
        for claim in self:
            if claim.state != "certified":
                raise UserError(self.env._(
                    "Certify the claim before invoicing."))
            if not claim.project_id.client_id:
                raise UserError(self.env._(
                    "Set the project's Client before invoicing."))
            claim.move_id = claim._build_invoice()
            claim.state = "invoiced"
        return self.action_view_invoice()

    def _build_invoice(self):
        self.ensure_one()
        company = self.env.company
        income = self.env["account.account"].search(
            [("account_type", "=", "income"),
             ("company_ids", "in", company.id)], limit=1)
        if not income:
            raise UserError(self.env._(
                "No income account found — configure the chart of accounts."))
        # Invoice the net amount certified this period (work done less the
        # retention withheld). Retention stays tracked on the claim and is
        # billed later through a retention-release certificate.
        retention_note = ""
        if self.retention_this:
            retention_note = self.env._(
                " (net of %(amt)s retention)",
                amt=self.currency_id.round(self.retention_this))
        lines = [
            (0, 0, {
                "name": self.env._(
                    "Work executed to %(date)s — %(ref)s%(note)s",
                    date=self.date_to, ref=self.reference, note=retention_note),
                "quantity": 1,
                "price_unit": self.amount_due,
                "account_id": income.id,
            }),
        ]
        return self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.project_id.client_id.id,
            "invoice_date": fields.Date.context_today(self),
            "currency_id": self.currency_id.id,
            "invoice_origin": self.reference,
            "invoice_line_ids": lines,
        })

    def action_view_invoice(self):
        self.ensure_one()
        if not self.move_id:
            return False
        return {
            "type": "ir.actions.act_window",
            "res_model": "account.move",
            "res_id": self.move_id.id,
            "view_mode": "form",
            "target": "current",
        }

    def action_mark_paid(self):
        self.filtered(lambda c: c.state == "invoiced").state = "paid"


class ConstructionProgressClaimLine(models.Model):
    _name = "construction.progress.claim.line"
    _description = "Progress Claim Line"
    _order = "claim_id, sequence, id"

    claim_id = fields.Many2one(
        "construction.progress.claim", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    boq_line_id = fields.Many2one("construction.boq.line", required=True)
    name = fields.Char(related="boq_line_id.name", string="Description")
    section_id = fields.Many2one(related="boq_line_id.section_id", store=True)
    currency_id = fields.Many2one(related="claim_id.currency_id")
    unit_rate = fields.Monetary(related="boq_line_id.unit_rate")
    qty_contract = fields.Float(related="boq_line_id.quantity",
                                string="Contract Qty")
    qty_previous = fields.Float(string="Previous Qty", readonly=True)
    qty_this_period = fields.Float(string="This Period")
    qty_cumulative = fields.Float(compute="_compute_qty", store=True,
                                  string="Cumulative")
    pct_complete = fields.Float(compute="_compute_qty", store=True,
                                string="% Complete")
    amount_cumulative = fields.Monetary(compute="_compute_qty", store=True)
    amount_this = fields.Monetary(compute="_compute_qty", store=True,
                                  string="Amount This Period")

    @api.depends("qty_previous", "qty_this_period", "unit_rate",
                 "qty_contract")
    def _compute_qty(self):
        for line in self:
            line.qty_cumulative = line.qty_previous + line.qty_this_period
            line.amount_cumulative = line.qty_cumulative * line.unit_rate
            line.amount_this = line.qty_this_period * line.unit_rate
            line.pct_complete = (
                line.qty_cumulative / line.qty_contract * 100
                if line.qty_contract else 0.0)
