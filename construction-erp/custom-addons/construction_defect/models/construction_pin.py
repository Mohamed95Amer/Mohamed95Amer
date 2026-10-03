from odoo import api, fields, models


class ConstructionPin(models.Model):
    _inherit = "construction.pin"

    defect_id = fields.Many2one("construction.defect", ondelete="cascade")

    @api.model
    def _pin_type_registry(self):
        registry = super()._pin_type_registry()
        # Insert 'defect' just after 'task' so it reads Task / Defect / RFI…
        registry.insert(1, {
            "id": "defect",
            "label": self.env._("Defect"),
            "icon": "fa-exclamation-triangle",
            "model": "construction.defect",
            "link_field": "defect_id",
        })
        return registry

    def _pin_target_vals(self, pin_type, name, description, sheet):
        if pin_type == "defect":
            return {
                "name": name,
                "project_id": sheet.project_id.id,
                "description": description,
            }
        return super()._pin_target_vals(pin_type, name, description, sheet)

    def _pin_status(self):
        self.ensure_one()
        if self.pin_type == "defect" and self.defect_id:
            label = dict(self.defect_id._fields["state"].selection).get(
                self.defect_id.state)
            return label, self.defect_id.status_bucket()
        return super()._pin_status()

    @api.depends("defect_id.state")
    def _compute_status_color(self):
        super()._compute_status_color()
