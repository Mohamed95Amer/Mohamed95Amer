from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionSubcontract(models.Model):
    """A commitment to a subcontractor for a scope of work, priced at our
    cost. Payment certificates certify the sub's work done and generate
    vendor bills, net of retention and back-charges."""

    _name = "construction.subcontract"
    _description = "Subcontract"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "SC"
    _order = "id desc"

    subcontractor_id = fields.Many2one(
        "res.partner", string="Subcontractor", required=True, tracking=True)
    trade = fields.Char(help="e.g. HVAC, Blockwork, Waterproofing.")
    description = fields.Text()
    currency_id = fields.Many2one(
        related="project_id.currency_id", store=True)
    state = fields.Selection(
        [("draft", "Draft"), ("confirmed", "Confirmed"), ("closed", "Closed")],
        default="draft", tracking=True)
    date_start = fields.Date()
    date_end = fields.Date()
    line_ids = fields.One2many("construction.subcontract.line", "subcontract_id")
    retention_percent = fields.Float(default=10.0)
    retention_cap_percent = fields.Float(default=5.0)
    amount_total = fields.Monetary(compute="_compute_amounts", store=True,
                                   string="Subcontract Value")
    amount_certified = fields.Monetary(compute="_compute_progress",
                                       string="Certified to Date")
    amount_retained = fields.Monetary(compute="_compute_progress",
                                      string="Retention Held")
    payment_ids = fields.One2many(
        "construction.subcontract.payment", "subcontract_id")
    payment_count = fields.Integer(compute="_compute_progress")

    @api.depends("line_ids.amount")
    def _compute_amounts(self):
        for sc in self:
            sc.amount_total = sum(sc.line_ids.mapped("amount"))

    def _compute_progress(self):
        for sc in self:
            latest = sc.payment_ids.sorted("sequence_no")[-1:] \
                if sc.payment_ids else sc.payment_ids
            sc.amount_certified = latest.gross_cumulative if latest else 0.0
            sc.amount_retained = latest.retention_cumulative if latest else 0.0
            sc.payment_count = len(sc.payment_ids)

    def action_confirm(self):
        self.filtered(lambda s: s.state == "draft").state = "confirmed"

    def action_close(self):
        self.state = "closed"

    def action_new_payment(self):
        self.ensure_one()
        payment = self.env["construction.subcontract.payment"].create(
            {"subcontract_id": self.id})
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.subcontract.payment",
            "res_id": payment.id,
            "view_mode": "form",
            "target": "current",
        }


class ConstructionSubcontractLine(models.Model):
    _name = "construction.subcontract.line"
    _description = "Subcontract Scope Line"
    _order = "subcontract_id, sequence, id"

    subcontract_id = fields.Many2one(
        "construction.subcontract", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    boq_line_id = fields.Many2one(
        "construction.boq.line", string="BOQ Cost Item",
        domain="[('project_id', '=', parent.project_id)]")
    name = fields.Char(string="Description", required=True)
    uom_id = fields.Many2one("uom.uom", string="UoM")
    quantity = fields.Float(default=1.0)
    unit_rate = fields.Monetary(string="Unit Rate (Cost)")
    currency_id = fields.Many2one(related="subcontract_id.currency_id")
    amount = fields.Monetary(compute="_compute_amount", store=True)

    @api.depends("quantity", "unit_rate")
    def _compute_amount(self):
        for line in self:
            line.amount = line.quantity * line.unit_rate


class ConstructionSubcontractPayment(models.Model):
    """Subcontractor payment certificate — the payable mirror of an IPC."""

    _name = "construction.subcontract.payment"
    _description = "Subcontractor Payment Certificate"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "SPC"
    _order = "subcontract_id, sequence_no"

    name = fields.Char(default=lambda self: self.env._("Payment Certificate"))
    subcontract_id = fields.Many2one(
        "construction.subcontract", required=True, ondelete="cascade")
    subcontractor_id = fields.Many2one(
        related="subcontract_id.subcontractor_id", store=True)
    currency_id = fields.Many2one(
        related="subcontract_id.currency_id", store=True)
    sequence_no = fields.Integer(string="Cert No.", readonly=True, copy=False)
    date = fields.Date(default=fields.Date.context_today)
    previous_payment_id = fields.Many2one(
        "construction.subcontract.payment", readonly=True)
    line_ids = fields.One2many(
        "construction.subcontract.payment.line", "payment_id")
    backcharge_ids = fields.One2many(
        "construction.subcontract.backcharge", "payment_id")
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("certified", "Certified"), ("billed", "Billed"), ("paid", "Paid")],
        default="draft", tracking=True)
    move_id = fields.Many2one("account.move", readonly=True, copy=False)

    retention_percent = fields.Float()
    retention_cap_percent = fields.Float()
    amount_subcontract = fields.Monetary(related="subcontract_id.amount_total")
    gross_cumulative = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    gross_previous = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    gross_this = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    retention_cumulative = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    retention_this = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True)
    backcharge_this = fields.Monetary(compute="_compute_amounts", store=True)
    amount_due = fields.Monetary(
        compute="_compute_amounts", store=True, recursive=True,
        string="Net Payable")

    @api.depends("line_ids.amount_cumulative", "backcharge_ids.amount",
                 "retention_percent", "retention_cap_percent",
                 "amount_subcontract",
                 "previous_payment_id.gross_cumulative",
                 "previous_payment_id.retention_cumulative")
    def _compute_amounts(self):
        for pay in self:
            cumulative = sum(pay.line_ids.mapped("amount_cumulative"))
            prev_gross = pay.previous_payment_id.gross_cumulative
            pay.gross_cumulative = cumulative
            pay.gross_previous = prev_gross
            pay.gross_this = cumulative - prev_gross
            cap = pay.amount_subcontract * pay.retention_cap_percent / 100.0
            retention = min(cumulative * pay.retention_percent / 100.0, cap) \
                if pay.retention_cap_percent else \
                cumulative * pay.retention_percent / 100.0
            pay.retention_cumulative = retention
            pay.retention_this = retention - \
                pay.previous_payment_id.retention_cumulative
            pay.backcharge_this = sum(pay.backcharge_ids.mapped("amount"))
            pay.amount_due = pay.gross_this - pay.retention_this - \
                pay.backcharge_this

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("subcontract_id") and not vals.get("project_id"):
                sc = self.env["construction.subcontract"].browse(
                    vals["subcontract_id"])
                vals["project_id"] = sc.project_id.id
        payments = super().create(vals_list)
        for pay in payments:
            previous = self.search(
                [("subcontract_id", "=", pay.subcontract_id.id),
                 ("id", "!=", pay.id)],
                order="sequence_no desc", limit=1)
            pay.previous_payment_id = previous
            pay.sequence_no = (previous.sequence_no or 0) + 1
            if not pay.retention_percent:
                pay.retention_percent = pay.subcontract_id.retention_percent
            if not pay.retention_cap_percent:
                pay.retention_cap_percent = \
                    pay.subcontract_id.retention_cap_percent
            if pay.subcontract_id and not pay.line_ids:
                pay._populate_lines()
        return payments

    def _populate_lines(self):
        self.ensure_one()
        self.line_ids.unlink()
        prev = {l.subcontract_line_id.id: l
                for l in self.previous_payment_id.line_ids}
        self.env["construction.subcontract.payment.line"].create([
            {
                "payment_id": self.id,
                "subcontract_line_id": sl.id,
                "qty_previous": prev[sl.id].qty_cumulative if sl.id in prev else 0.0,
            }
            for sl in self.subcontract_id.line_ids
        ])

    def action_submit(self):
        self.filtered(lambda p: p.state == "draft").state = "submitted"

    def action_certify(self):
        for pay in self:
            if pay.state != "submitted":
                raise UserError(self.env._(
                    "Only submitted certificates can be certified."))
            pay.state = "certified"

    def action_create_bill(self):
        for pay in self:
            if pay.state != "certified":
                raise UserError(self.env._(
                    "Certify the certificate before billing."))
            pay.move_id = pay._build_bill()
            pay.state = "billed"
        return self.action_view_bill()

    def _build_bill(self):
        self.ensure_one()
        company = self.env.company
        expense = self.env["account.account"].search(
            [("account_type", "=", "expense"),
             ("company_ids", "in", company.id)], limit=1)
        if not expense:
            raise UserError(self.env._(
                "No expense account found — configure the chart of accounts."))
        note = ""
        deductions = self.retention_this + self.backcharge_this
        if deductions:
            note = self.env._(
                " (net of %(ret)s retention and %(bc)s back-charges)",
                ret=self.currency_id.round(self.retention_this),
                bc=self.currency_id.round(self.backcharge_this))
        return self.env["account.move"].create({
            "move_type": "in_invoice",
            "partner_id": self.subcontractor_id.id,
            "invoice_date": fields.Date.context_today(self),
            "currency_id": self.currency_id.id,
            "invoice_origin": self.reference,
            "invoice_line_ids": [(0, 0, {
                "name": self.env._(
                    "Subcontract work to %(date)s — %(ref)s%(note)s",
                    date=self.date, ref=self.reference, note=note),
                "quantity": 1,
                "price_unit": self.amount_due,
                "account_id": expense.id,
            })],
        })

    def action_view_bill(self):
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
        self.filtered(lambda p: p.state == "billed").state = "paid"


class ConstructionSubcontractPaymentLine(models.Model):
    _name = "construction.subcontract.payment.line"
    _description = "Subcontractor Payment Line"
    _order = "payment_id, id"

    payment_id = fields.Many2one(
        "construction.subcontract.payment", required=True, ondelete="cascade")
    subcontract_line_id = fields.Many2one(
        "construction.subcontract.line", required=True)
    name = fields.Char(related="subcontract_line_id.name", string="Description")
    currency_id = fields.Many2one(related="payment_id.currency_id")
    unit_rate = fields.Monetary(related="subcontract_line_id.unit_rate")
    qty_contract = fields.Float(related="subcontract_line_id.quantity")
    qty_previous = fields.Float(readonly=True)
    qty_this_period = fields.Float(string="This Period")
    qty_cumulative = fields.Float(compute="_compute_qty", store=True)
    amount_cumulative = fields.Monetary(compute="_compute_qty", store=True)
    amount_this = fields.Monetary(compute="_compute_qty", store=True)

    @api.depends("qty_previous", "qty_this_period", "unit_rate")
    def _compute_qty(self):
        for line in self:
            line.qty_cumulative = line.qty_previous + line.qty_this_period
            line.amount_cumulative = line.qty_cumulative * line.unit_rate
            line.amount_this = line.qty_this_period * line.unit_rate


class ConstructionSubcontractBackcharge(models.Model):
    _name = "construction.subcontract.backcharge"
    _description = "Subcontractor Back-Charge"

    payment_id = fields.Many2one(
        "construction.subcontract.payment", required=True, ondelete="cascade")
    name = fields.Char(string="Reason", required=True)
    defect_id = fields.Many2one("construction.defect", string="Related Defect")
    amount = fields.Monetary()
    currency_id = fields.Many2one(related="payment_id.currency_id")
