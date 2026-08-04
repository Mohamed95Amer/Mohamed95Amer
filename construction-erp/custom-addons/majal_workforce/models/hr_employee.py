from odoo import _, fields, models


class HrEmployee(models.Model):
    _inherit = "hr.employee"

    majal_allocation_ids = fields.One2many(
        "majal.allocation", "employee_id", string="Allocations")
    majal_allocation_count = fields.Integer(
        compute="_compute_majal_allocation")
    majal_current_percent = fields.Float(
        string="Allocated today",
        compute="_compute_majal_allocation",
        help="Everything this person is committed to today, added up. Over "
             "100% is reported rather than prevented.",
    )
    majal_is_overallocated = fields.Boolean(
        compute="_compute_majal_allocation")

    def _compute_majal_allocation(self):
        today = fields.Date.context_today(self)
        Allocation = self.env["majal.allocation"]
        for employee in self:
            live = Allocation.sudo().search([
                ("employee_id", "=", employee.id),
                ("active", "=", True),
                ("date_start", "<=", today),
                "|",
                ("date_end", "=", False),
                ("date_end", ">=", today),
            ])
            employee.majal_allocation_count = len(live)
            employee.majal_current_percent = sum(
                live.mapped("allocation_percent"))
            employee.majal_is_overallocated = (
                employee.majal_current_percent > 100.0)

    def action_majal_allocate(self):
        return {
            "type": "ir.actions.act_window",
            "name": _("Allocate People"),
            "res_model": "majal.allocate.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_employee_ids": [fields.Command.set(self.ids)]},
        }
