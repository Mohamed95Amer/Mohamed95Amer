from odoo import _, api, fields, models
from odoo.exceptions import UserError


class MajalAllocateWizard(models.TransientModel):
    """Put a crew on a job in one action.

    Allocating people one at a time is the difference between a feature that
    gets used and one that gets worked around: crews move as a unit, and a
    project mobilising has twenty people to place on the same morning.
    """

    _name = "majal.allocate.wizard"
    _description = "Allocate People"

    employee_ids = fields.Many2many(
        "hr.employee", string="People", required=True)
    project_id = fields.Many2one(
        "project.project", string="Project",
        domain="[('is_construction', '=', True)]")
    location_id = fields.Many2one("facility.location", string="Location")
    role_id = fields.Many2one(
        "majal.allocation.role", string="Role", required=True)
    date_start = fields.Date(
        string="From", required=True, default=fields.Date.context_today)
    date_end = fields.Date(string="Until")
    allocation_percent = fields.Float(string="% of time", default=100.0)
    copy_from_project_id = fields.Many2one(
        "project.project",
        string="Copy the team from",
        domain="[('is_construction', '=', True)]",
        help="Bring across everybody currently allocated to another project.",
    )
    warning = fields.Char(compute="_compute_warning")

    @api.onchange("role_id")
    def _onchange_role(self):
        if self.role_id and self.role_id.default_percent:
            self.allocation_percent = self.role_id.default_percent

    @api.onchange("copy_from_project_id")
    def _onchange_copy_from(self):
        if not self.copy_from_project_id:
            return
        allocations = self.env["majal.allocation"].search([
            ("project_id", "=", self.copy_from_project_id.id),
            ("state", "!=", "ended"),
        ])
        self.employee_ids = allocations.mapped("employee_id")

    @api.depends("employee_ids", "date_start", "date_end",
                 "allocation_percent")
    def _compute_warning(self):
        for wizard in self:
            wizard.warning = False
            if not wizard.employee_ids:
                continue
            Allocation = wizard.env["majal.allocation"]
            busy = []
            for employee in wizard.employee_ids:
                segments = Allocation._capacity_segments(
                    employee, wizard.date_start, wizard.date_end)
                peak = max(
                    (total for _s, _e, total, _ids in segments), default=0.0)
                if peak + wizard.allocation_percent > 100.0:
                    busy.append("%s (%d%%)" % (employee.name, peak))
            if busy:
                wizard.warning = _(
                    "Already committed over these dates: %s. This is allowed "
                    "— it is shown so it is a decision rather than a surprise.",
                    ", ".join(busy),
                )

    def action_allocate(self):
        self.ensure_one()
        if bool(self.project_id) == bool(self.location_id):
            raise UserError(_(
                "Choose either a project or a location for this allocation."))
        target = (
            {"project_id": self.project_id.id} if self.project_id
            else {"location_id": self.location_id.id}
        )
        Allocation = self.env["majal.allocation"]
        created = Allocation
        for employee in self.employee_ids:
            existing = Allocation.search([
                ("employee_id", "=", employee.id),
                ("role_id", "=", self.role_id.id),
                ("date_start", "<=", self.date_end or "2999-12-31"),
                "|",
                ("date_end", "=", False),
                ("date_end", ">=", self.date_start),
            ] + [(key, "=", value) for key, value in target.items()])
            if existing:
                # Allocating somebody who is already there is a normal slip
                # when placing twenty people; skipping is kinder than failing
                # the whole action on the nineteenth.
                continue
            created |= Allocation.create({
                "employee_id": employee.id,
                "role_id": self.role_id.id,
                "date_start": self.date_start,
                "date_end": self.date_end,
                "allocation_percent": self.allocation_percent,
                **target,
            })
        return {
            "type": "ir.actions.act_window",
            "name": _("Allocations"),
            "res_model": "majal.allocation",
            "view_mode": "list,form",
            "domain": [("id", "in", created.ids)],
        }
