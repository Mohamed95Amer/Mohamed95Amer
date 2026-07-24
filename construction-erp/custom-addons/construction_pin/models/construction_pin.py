from odoo import api, fields, models


class ConstructionPin(models.Model):
    _name = "construction.pin"
    _description = "Drawing Pin"
    _inherit = ["plan.pin.mixin"]
    _sheet_field = "revision_id"
    _sheet_model = "construction.drawing.revision"
    _order = "revision_id, id"

    revision_id = fields.Many2one(
        "construction.drawing.revision", required=True, ondelete="cascade",
        index=True)
    project_id = fields.Many2one(
        related="revision_id.project_id", store=True, index=True)
    task_id = fields.Many2one("project.task", ondelete="cascade")
    rfi_id = fields.Many2one("construction.rfi", ondelete="cascade")

    @api.model
    def _pin_type_registry(self):
        return [
            {"id": "task", "label": self.env._("Task"), "icon": "fa-wrench",
             "model": "project.task", "link_field": "task_id"},
            {"id": "rfi", "label": self.env._("RFI"), "icon": "fa-question",
             "model": "construction.rfi", "link_field": "rfi_id"},
            {"id": "note", "label": self.env._("Note"),
             "icon": "fa-sticky-note", "model": False, "link_field": False},
        ]

    def _pin_target_vals(self, pin_type, name, description, sheet):
        project = sheet.project_id
        if pin_type == "task":
            return {"name": name, "project_id": project.id}
        if pin_type == "rfi":
            return {"name": name, "project_id": project.id,
                    "question": description or "<p></p>"}
        return super()._pin_target_vals(pin_type, name, description, sheet)

    def _pin_status(self):
        self.ensure_one()
        if self.pin_type == "task" and self.task_id:
            label = dict(self.task_id._fields["state"].selection).get(
                self.task_id.state, self.task_id.state)
            bucket = ("done" if self.task_id.state in ("1_done", "1_canceled")
                      else "in_progress")
            return label, bucket
        if self.pin_type == "rfi" and self.rfi_id:
            label = dict(self.rfi_id._fields["state"].selection).get(
                self.rfi_id.state)
            bucket = {"draft": "open", "submitted": "open",
                      "answered": "done", "closed": "done"}.get(
                self.rfi_id.state, "open")
            return label, bucket
        return super()._pin_status()

    @api.depends("task_id.state", "rfi_id.state")
    def _compute_status_color(self):
        super()._compute_status_color()

    def _sheet_context_name(self, sheet):
        return sheet.project_id.display_name

    def _sibling_sheets(self, sheet):
        return self.env["construction.drawing.revision"].search(
            [("project_id", "=", sheet.project_id.id)])
