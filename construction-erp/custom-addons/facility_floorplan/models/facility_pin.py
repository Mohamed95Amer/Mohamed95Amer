from odoo import api, fields, models


class FacilityPin(models.Model):
    """A pin dropped on a facility floor plan — linking an asset, a maintenance
    request or a plain note to a point on the plan. Reuses the shared
    ``plan.pin.mixin`` and OWL Plan Viewer."""

    _name = "facility.pin"
    _description = "Floor Plan Pin"
    _inherit = ["plan.pin.mixin"]
    _sheet_field = "floorplan_id"
    _sheet_model = "facility.floorplan"
    _order = "floorplan_id, id"

    floorplan_id = fields.Many2one(
        "facility.floorplan", required=True, ondelete="cascade", index=True)
    location_id = fields.Many2one(
        related="floorplan_id.location_id", store=True, index=True)
    equipment_id = fields.Many2one("maintenance.equipment", ondelete="cascade")
    request_id = fields.Many2one("maintenance.request", ondelete="cascade")

    @api.model
    def _pin_type_registry(self):
        return [
            {"id": "asset", "label": self.env._("Asset"),
             "icon": "fa-cube", "model": "maintenance.equipment",
             "link_field": "equipment_id"},
            {"id": "request", "label": self.env._("Request"),
             "icon": "fa-wrench", "model": "maintenance.request",
             "link_field": "request_id"},
            {"id": "note", "label": self.env._("Note"),
             "icon": "fa-sticky-note", "model": False, "link_field": False},
        ]

    def _pin_target_vals(self, pin_type, name, description, sheet):
        location = sheet.location_id
        if pin_type == "asset":
            return {
                "name": name,
                "facility_location_id": location.id,
            }
        if pin_type == "request":
            return {
                "name": name,
                "description": description or False,
                "maintenance_type": "corrective",
            }
        return super()._pin_target_vals(pin_type, name, description, sheet)

    def _pin_status(self):
        self.ensure_one()
        if self.pin_type == "asset" and self.equipment_id:
            crit = dict(self.equipment_id._fields["criticality"].selection).get(
                self.equipment_id.criticality)
            bucket = ("open" if self.equipment_id.criticality in (
                "high", "critical") else "info")
            return crit or self.env._("Asset"), bucket
        if self.pin_type == "request" and self.request_id:
            stage = self.request_id.stage_id
            label = stage.name or self.env._("Request")
            bucket = "done" if stage.done else "in_progress"
            return label, bucket
        return super()._pin_status()

    @api.depends("equipment_id.criticality",
                 "request_id.stage_id", "request_id.stage_id.done")
    def _compute_status_color(self):
        super()._compute_status_color()

    def _sheet_context_name(self, sheet):
        return sheet.location_id.complete_name or sheet.location_id.display_name

    def _sibling_sheets(self, sheet):
        return self.env["facility.floorplan"].search(
            [("location_id", "=", sheet.location_id.id)])
