from odoo import api, fields, models


class MajalMaintenanceRequest(models.Model):
    """Something wrong in an occupied unit, as reported by whoever lives
    or works in it.

    This is the property-side record that a problem exists and who is
    waiting on it. Scheduling the trade, ordering the part and closing
    the work order belong to the facilities modules; this model does not
    try to be a CMMS.
    """

    _name = "majal.maintenance.request"
    _description = "Unit Maintenance Request"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "priority desc, id desc"

    name = fields.Char(string="Subject", required=True, tracking=True)
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="restrict", index=True, tracking=True)
    lease_id = fields.Many2one(
        "majal.lease", domain="[('unit_id', '=', unit_id)]", tracking=True)
    partner_id = fields.Many2one(
        "res.partner", string="Reported By", tracking=True)
    user_id = fields.Many2one(
        "res.users", string="Assigned To", default=lambda self: self.env.user,
        tracking=True)

    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True, index=True)
    building_id = fields.Many2one(related="unit_id.building_id", store=True, readonly=True)
    company_id = fields.Many2one(related="unit_id.company_id", store=True, readonly=True)

    category = fields.Selection(
        [
            ("plumbing", "Plumbing"),
            ("electrical", "Electrical"),
            ("hvac", "HVAC"),
            ("appliance", "Appliance"),
            ("structural", "Structural"),
            ("other", "Other"),
        ],
        default="other", required=True,
    )
    priority = fields.Selection(
        [("0", "Low"), ("1", "Normal"), ("2", "Urgent")], default="1")
    state = fields.Selection(
        [
            ("new", "New"),
            ("in_progress", "In Progress"),
            ("done", "Done"),
            ("cancelled", "Cancelled"),
        ],
        default="new", required=True, tracking=True,
    )
    reported_date = fields.Date(default=fields.Date.context_today, required=True)
    closed_date = fields.Date(readonly=True, copy=False)
    description = fields.Text()
    resolution = fields.Text()

    @api.onchange("unit_id")
    def _onchange_unit_id(self):
        for request in self:
            if not request.unit_id:
                continue
            lease = self.env["majal.lease"].search(
                [("unit_id", "=", request.unit_id._origin.id),
                 ("state", "=", "active")], limit=1)
            request.lease_id = lease
            request.partner_id = lease.tenant_id or request.unit_id.owner_id

    def action_start(self):
        self.write({"state": "in_progress"})
        return True

    def action_done(self):
        for request in self:
            request.state = "done"
            request.closed_date = fields.Date.context_today(request)
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True

    def action_reset(self):
        self.write({"state": "new", "closed_date": False})
        return True
