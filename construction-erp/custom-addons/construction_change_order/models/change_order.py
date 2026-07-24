from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionChangeEvent(models.Model):
    """A potential change identified on site (from an RFI, a site instruction,
    a client request or a design change) — the register entry that may become
    a priced variation order."""

    _name = "construction.change.event"
    _description = "Change Event"
    _inherit = ["construction.document.mixin", "mail.thread"]
    _doc_prefix = "CE"
    _order = "id desc"

    description = fields.Html()
    origin = fields.Selection(
        [("rfi", "RFI"), ("site_instruction", "Site Instruction"),
         ("client_request", "Client Request"), ("design_change", "Design Change"),
         ("other", "Other")],
        default="other", required=True)
    source_rfi_id = fields.Many2one("construction.rfi", string="Source RFI")
    date = fields.Date(default=fields.Date.context_today)
    estimated_amount = fields.Monetary()
    currency_id = fields.Many2one(
        related="project_id.currency_id", store=True)
    state = fields.Selection(
        [("open", "Open"), ("converted", "Converted to VO"),
         ("rejected", "Rejected")],
        default="open", tracking=True)
    change_order_ids = fields.One2many(
        "construction.change.order", "change_event_id")
    change_order_count = fields.Integer(compute="_compute_co_count")

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state == "open"

    def _compute_co_count(self):
        for event in self:
            event.change_order_count = len(event.change_order_ids)

    def action_create_change_order(self):
        self.ensure_one()
        boq = self.env["construction.boq"].search(
            [("project_id", "=", self.project_id.id),
             ("state", "in", ("approved", "locked"))],
            order="version desc", limit=1)
        co = self.env["construction.change.order"].create({
            "name": self.name,
            "project_id": self.project_id.id,
            "change_event_id": self.id,
            "boq_id": boq.id,
        })
        self.state = "converted"
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.change.order",
            "res_id": co.id,
            "view_mode": "form",
            "target": "current",
        }

    def action_reject(self):
        self.state = "rejected"


class ConstructionChangeOrder(models.Model):
    """A priced variation order. On approval its lines are appended to the
    project BOQ as variation items, adjusting the contract value; they then
    flow into subsequent progress certificates."""

    _name = "construction.change.order"
    _description = "Change Order / Variation"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "VO"
    _order = "id desc"

    change_event_id = fields.Many2one("construction.change.event")
    boq_id = fields.Many2one(
        "construction.boq", required=True,
        domain="[('project_id', '=', project_id)]")
    currency_id = fields.Many2one(related="boq_id.currency_id", store=True)
    change_type = fields.Selection(
        [("addition", "Addition (adds scope)"),
         ("omission", "Omission (reduces scope)")],
        default="addition", required=True)
    reason = fields.Html()
    line_ids = fields.One2many("construction.change.order.line", "change_order_id")
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("approved", "Approved"), ("rejected", "Rejected")],
        default="draft", tracking=True)
    approved_date = fields.Date(readonly=True)
    boq_section_id = fields.Many2one(
        "construction.boq.section", readonly=True,
        help="BOQ section created for this variation's items.")
    amount_sell_total = fields.Monetary(compute="_compute_totals", store=True)
    amount_cost_total = fields.Monetary(compute="_compute_totals", store=True)

    @property
    def _sign(self):
        self.ensure_one()
        return 1 if self.change_type == "addition" else -1

    @api.depends("line_ids.amount_sell", "line_ids.amount_cost", "change_type")
    def _compute_totals(self):
        for co in self:
            sign = 1 if co.change_type == "addition" else -1
            co.amount_sell_total = sign * sum(co.line_ids.mapped("amount_sell"))
            co.amount_cost_total = sign * sum(co.line_ids.mapped("amount_cost"))

    def action_submit(self):
        for co in self:
            if co.state != "draft":
                raise UserError(self.env._("Only draft VOs can be submitted."))
            if not co.line_ids:
                raise UserError(self.env._("Add at least one line before submitting."))
            co.state = "submitted"

    def action_approve(self):
        for co in self:
            if co.state != "submitted":
                raise UserError(self.env._("Only submitted VOs can be approved."))
            co._apply_to_boq()
            co.write({"state": "approved",
                      "approved_date": fields.Date.context_today(co)})
            if co.change_event_id:
                co.change_event_id.state = "converted"

    def action_reject(self):
        self.filtered(lambda c: c.state in ("draft", "submitted")).write(
            {"state": "rejected"})

    def _apply_to_boq(self):
        """Append the VO lines to the BOQ as variation items."""
        self.ensure_one()
        section = self.env["construction.boq.section"].with_context(
            adding_variation=True).create({
                "boq_id": self.boq_id.id,
                "code": self.reference,
                "name": self.env._("Variation — %s", self.name),
                "sequence": 900,
            })
        self.boq_section_id = section
        sign = self._sign
        BoqLine = self.env["construction.boq.line"].with_context(
            adding_variation=True)
        for line in self.line_ids:
            BoqLine.create({
                "boq_id": self.boq_id.id,
                "section_id": section.id,
                "item_code": line.item_code,
                "name": line.name,
                "uom_id": line.uom_id.id,
                "quantity": sign * line.quantity,
                "unit_rate": line.unit_rate,
                "cost_material": line.unit_cost,
                "is_variation": True,
            })

    def action_view_boq_lines(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.boq.line",
            "name": self.env._("Variation Lines"),
            "view_mode": "list,form",
            "domain": [("section_id", "=", self.boq_section_id.id)],
        }


class ConstructionChangeOrderLine(models.Model):
    _name = "construction.change.order.line"
    _description = "Change Order Line"
    _order = "change_order_id, sequence, id"

    change_order_id = fields.Many2one(
        "construction.change.order", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    item_code = fields.Char()
    name = fields.Char(string="Description", required=True)
    uom_id = fields.Many2one("uom.uom", string="UoM")
    quantity = fields.Float(default=1.0)
    unit_rate = fields.Monetary(string="Unit Rate (Sell)")
    unit_cost = fields.Monetary(string="Unit Cost")
    currency_id = fields.Many2one(related="change_order_id.currency_id")
    amount_sell = fields.Monetary(compute="_compute_amounts", store=True)
    amount_cost = fields.Monetary(compute="_compute_amounts", store=True)

    @api.depends("quantity", "unit_rate", "unit_cost")
    def _compute_amounts(self):
        for line in self:
            line.amount_sell = line.quantity * line.unit_rate
            line.amount_cost = line.quantity * line.unit_cost
