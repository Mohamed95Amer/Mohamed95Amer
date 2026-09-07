from odoo import api, fields, models


class MajalUnit(models.Model):
    _inherit = "majal.unit"

    lease_ids = fields.One2many("majal.lease", "unit_id", string="Leases")
    lease_count = fields.Integer(compute="_compute_operations_fields")
    active_lease_id = fields.Many2one(
        "majal.lease", compute="_compute_operations_fields", string="Current Lease")
    tenant_id = fields.Many2one(
        "res.partner", compute="_compute_operations_fields", string="Current Tenant")
    maintenance_request_ids = fields.One2many(
        "majal.maintenance.request", "unit_id", string="Maintenance Requests")
    open_maintenance_count = fields.Integer(compute="_compute_operations_fields")

    @api.depends("lease_ids", "lease_ids.state",
                 "maintenance_request_ids", "maintenance_request_ids.state")
    def _compute_operations_fields(self):
        for unit in self:
            unit.lease_count = len(unit.lease_ids)
            active_lease = unit.lease_ids.filtered(lambda l: l.state == "active")[:1]
            unit.active_lease_id = active_lease
            unit.tenant_id = active_lease.tenant_id
            unit.open_maintenance_count = len(
                unit.maintenance_request_ids.filtered(
                    lambda r: r.state in ("new", "in_progress")))

    def action_view_leases(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Leases"),
            "res_model": "majal.lease",
            "view_mode": "list,form",
            "domain": [("unit_id", "=", self.id)],
            "context": {"default_unit_id": self.id},
        }

    def action_view_maintenance_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Maintenance Requests"),
            "res_model": "majal.maintenance.request",
            "view_mode": "list,form",
            "domain": [("unit_id", "=", self.id)],
            "context": {"default_unit_id": self.id},
        }
