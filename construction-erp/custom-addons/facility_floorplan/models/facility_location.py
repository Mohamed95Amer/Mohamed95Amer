from odoo import api, fields, models


class FacilityLocation(models.Model):
    _inherit = "facility.location"

    floorplan_ids = fields.One2many("facility.floorplan", "location_id")
    floorplan_count = fields.Integer(compute="_compute_floorplan_count")

    def _compute_floorplan_count(self):
        for loc in self:
            loc.floorplan_count = len(loc.floorplan_ids)

    def action_view_floorplans(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Floor Plans — %s", self.name),
            "res_model": "facility.floorplan",
            "view_mode": "list,form",
            "domain": [("location_id", "=", self.id)],
            "context": {"default_location_id": self.id},
        }
