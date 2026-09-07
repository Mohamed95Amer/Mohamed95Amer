from odoo import fields, models


class MaintenanceEquipment(models.Model):
    """Reverse of facility.pm.plan.equipment_id — the asset form had no way
    to see what preventive-maintenance plans exist for it, so an FM manager
    checking an asset's PM cover had to search the PM Plans register by hand.
    """

    _inherit = "maintenance.equipment"

    pm_plan_ids = fields.One2many(
        "facility.pm.plan", "equipment_id", string="PM Plans")
    pm_plan_count = fields.Integer(compute="_compute_pm_plan_count")

    def _compute_pm_plan_count(self):
        for equipment in self:
            equipment.pm_plan_count = len(equipment.pm_plan_ids)

    def action_view_pm_plans(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("PM Plans — %s", self.name),
            "res_model": "facility.pm.plan",
            "view_mode": "list,form",
            "domain": [("equipment_id", "=", self.id)],
            "context": {"default_equipment_id": self.id},
        }
