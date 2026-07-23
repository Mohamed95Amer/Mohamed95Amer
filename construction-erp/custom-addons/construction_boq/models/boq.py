from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionBoq(models.Model):
    _name = "construction.boq"
    _description = "Bill of Quantities"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "project_id, version desc"

    name = fields.Char(required=True, default="Bill of Quantities")
    project_id = fields.Many2one(
        "project.project",
        required=True,
        ondelete="restrict",
        domain=[("is_construction", "=", True)],
        index=True,
    )
    company_id = fields.Many2one(
        "res.company", related="project_id.company_id", store=True
    )
    currency_id = fields.Many2one(
        "res.currency", related="project_id.currency_id", store=True
    )
    version = fields.Integer(default=1, readonly=True)
    previous_version_id = fields.Many2one("construction.boq", readonly=True)
    state = fields.Selection(
        [("draft", "Draft"), ("approved", "Approved"), ("locked", "Locked")],
        default="draft",
        tracking=True,
    )
    # copy=False: action_new_revision copies sections/lines manually so that
    # line->section links are remapped to the new version's sections.
    section_ids = fields.One2many("construction.boq.section", "boq_id", copy=False)
    line_ids = fields.One2many("construction.boq.line", "boq_id", copy=False)
    amount_sell_total = fields.Monetary(
        compute="_compute_totals", store=True, string="Contract Amount"
    )
    amount_cost_total = fields.Monetary(
        compute="_compute_totals", store=True, string="Budget Cost"
    )
    margin_percent = fields.Float(compute="_compute_totals", store=True)

    @api.depends(
        "line_ids.amount_sell", "line_ids.amount_cost", "line_ids.is_variation"
    )
    def _compute_totals(self):
        for boq in self:
            boq.amount_sell_total = sum(boq.line_ids.mapped("amount_sell"))
            boq.amount_cost_total = sum(boq.line_ids.mapped("amount_cost"))
            boq.margin_percent = (
                (boq.amount_sell_total - boq.amount_cost_total)
                / boq.amount_sell_total * 100
                if boq.amount_sell_total
                else 0.0
            )

    def action_approve(self):
        for boq in self:
            if boq.state != "draft":
                raise UserError(self.env._("Only draft BOQs can be approved."))
            boq.state = "approved"

    def action_lock(self):
        self.filtered(lambda b: b.state == "approved").state = "locked"

    def action_new_revision(self):
        """Create a new draft version copying sections and lines."""
        self.ensure_one()
        new = self.copy(
            {
                "version": self.version + 1,
                "previous_version_id": self.id,
                "state": "draft",
            }
        )
        self.state = "locked"
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.boq",
            "res_id": new.id,
            "view_mode": "form",
        }

    def copy(self, default=None):
        new = super().copy(default)
        section_map = {}
        for section in self.section_ids.sorted("sequence"):
            section_map[section.id] = section.copy(
                {"boq_id": new.id, "line_ids": False}
            )
        for line in self.line_ids:
            line.copy(
                {
                    "boq_id": new.id,
                    "section_id": section_map[line.section_id.id].id
                    if line.section_id
                    else False,
                }
            )
        return new


class ConstructionBoqSection(models.Model):
    _name = "construction.boq.section"
    _description = "BOQ Section"
    _order = "boq_id, sequence, id"

    name = fields.Char(required=True)
    code = fields.Char(help="Section number, e.g. 03 or 03.100 (CSI-style).")
    sequence = fields.Integer(default=10)
    boq_id = fields.Many2one(
        "construction.boq", required=True, ondelete="cascade", index=True
    )
    parent_id = fields.Many2one("construction.boq.section", ondelete="cascade")
    line_ids = fields.One2many("construction.boq.line", "section_id")
    currency_id = fields.Many2one("res.currency", related="boq_id.currency_id")
    amount_sell = fields.Monetary(compute="_compute_amounts", store=True)
    amount_cost = fields.Monetary(compute="_compute_amounts", store=True)

    @api.depends("line_ids.amount_sell", "line_ids.amount_cost")
    def _compute_amounts(self):
        for section in self:
            section.amount_sell = sum(section.line_ids.mapped("amount_sell"))
            section.amount_cost = sum(section.line_ids.mapped("amount_cost"))


class ConstructionBoqLine(models.Model):
    _name = "construction.boq.line"
    _description = "BOQ Line"
    _order = "boq_id, section_id, sequence, id"

    name = fields.Char(string="Description", required=True)
    item_code = fields.Char()
    sequence = fields.Integer(default=10)
    boq_id = fields.Many2one(
        "construction.boq", required=True, ondelete="cascade", index=True
    )
    section_id = fields.Many2one(
        "construction.boq.section",
        ondelete="set null",
        domain="[('boq_id', '=', boq_id)]",
    )
    project_id = fields.Many2one(related="boq_id.project_id", store=True)
    currency_id = fields.Many2one("res.currency", related="boq_id.currency_id")
    product_id = fields.Many2one("product.product")
    uom_id = fields.Many2one("uom.uom", string="UoM")
    quantity = fields.Float(default=1.0, digits="Product Unit of Measure")
    unit_rate = fields.Monetary(string="Unit Rate (Sell)")
    # Budget cost breakdown per unit
    cost_material = fields.Monetary(string="Material Cost/Unit")
    cost_labour = fields.Monetary(string="Labour Cost/Unit")
    cost_equipment = fields.Monetary(string="Equipment Cost/Unit")
    cost_subcontract = fields.Monetary(string="Subcontract Cost/Unit")
    cost_overhead = fields.Monetary(string="Overhead Cost/Unit")
    unit_cost = fields.Monetary(compute="_compute_unit_cost", store=True)
    amount_sell = fields.Monetary(compute="_compute_amounts", store=True)
    amount_cost = fields.Monetary(compute="_compute_amounts", store=True)
    analytic_account_id = fields.Many2one(
        "account.analytic.account",
        help="Job-costing bucket: actual costs (bills, timesheets, stock "
        "moves) booked on this analytic account are compared against this "
        "line's budget.",
    )
    is_variation = fields.Boolean(
        help="Line added by an approved variation/change order rather than "
        "the original contract."
    )
    qty_claimed = fields.Float(
        help="Cumulative quantity claimed in progress claims (filled by "
        "construction_progress_billing)."
    )
    qty_certified = fields.Float(
        help="Cumulative quantity certified by the consultant."
    )
    percent_complete = fields.Float(compute="_compute_percent_complete", store=True)

    @api.depends(
        "cost_material",
        "cost_labour",
        "cost_equipment",
        "cost_subcontract",
        "cost_overhead",
    )
    def _compute_unit_cost(self):
        for line in self:
            line.unit_cost = (
                line.cost_material
                + line.cost_labour
                + line.cost_equipment
                + line.cost_subcontract
                + line.cost_overhead
            )

    @api.depends("quantity", "unit_rate", "unit_cost")
    def _compute_amounts(self):
        for line in self:
            line.amount_sell = line.quantity * line.unit_rate
            line.amount_cost = line.quantity * line.unit_cost

    @api.depends("quantity", "qty_certified")
    def _compute_percent_complete(self):
        for line in self:
            line.percent_complete = (
                line.qty_certified / line.quantity * 100 if line.quantity else 0.0
            )

    @api.constrains("boq_id")
    def _check_boq_editable(self):
        for line in self:
            if line.boq_id.state == "locked":
                raise UserError(
                    self.env._("Locked BOQs cannot be modified. Create a new revision.")
                )

    def write(self, vals):
        protected = {
            "quantity", "unit_rate", "cost_material", "cost_labour",
            "cost_equipment", "cost_subcontract", "cost_overhead", "name",
        }
        if protected & set(vals) and any(
            line.boq_id.state == "locked" and not line.env.context.get("boq_force")
            for line in self
        ):
            raise UserError(
                self.env._("Locked BOQs cannot be modified. Create a new revision.")
            )
        return super().write(vals)
