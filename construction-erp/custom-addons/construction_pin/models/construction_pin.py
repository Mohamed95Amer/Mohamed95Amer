from odoo import api, fields, models
from odoo.exceptions import ValidationError


# Bootstrap colour indexes (Odoo kanban palette) per pin status.
PIN_COLORS = {
    "open": 1,        # red-ish
    "in_progress": 3,  # yellow
    "done": 10,       # green
    "info": 4,        # light blue
    "default": 0,
}


class ConstructionPin(models.Model):
    _name = "construction.pin"
    _description = "Drawing Pin"
    _order = "revision_id, id"

    name = fields.Char(required=True, default="Pin")
    revision_id = fields.Many2one(
        "construction.drawing.revision",
        required=True,
        ondelete="cascade",
        index=True,
    )
    project_id = fields.Many2one(
        related="revision_id.project_id", store=True, index=True
    )
    # Normalized coordinates on the sheet (0..1), independent of zoom/scale.
    pos_x = fields.Float(required=True, digits=(12, 9))
    pos_y = fields.Float(required=True, digits=(12, 9))
    pin_type = fields.Selection(
        [("task", "Task"), ("rfi", "RFI"), ("note", "Note")],
        default="note",
        required=True,
    )
    task_id = fields.Many2one("project.task", ondelete="cascade")
    rfi_id = fields.Many2one("construction.rfi", ondelete="cascade")
    note = fields.Text()
    status = fields.Char(compute="_compute_status_color")
    color = fields.Integer(compute="_compute_status_color")

    @api.constrains("pos_x", "pos_y")
    def _check_coords(self):
        for pin in self:
            if not (0.0 <= pin.pos_x <= 1.0) or not (0.0 <= pin.pos_y <= 1.0):
                raise ValidationError(
                    self.env._("Pin coordinates must be normalized between 0 and 1.")
                )

    @api.depends("pin_type", "task_id.state", "rfi_id.state")
    def _compute_status_color(self):
        for pin in self:
            status, bucket = self.env._("Note"), "info"
            if pin.pin_type == "task" and pin.task_id:
                status = dict(
                    pin.task_id._fields["state"].selection
                ).get(pin.task_id.state, pin.task_id.state)
                bucket = "done" if pin.task_id.state in ("1_done", "1_canceled") else "in_progress"
            elif pin.pin_type == "rfi" and pin.rfi_id:
                status = dict(
                    pin.rfi_id._fields["state"].selection
                ).get(pin.rfi_id.state)
                bucket = {
                    "draft": "open",
                    "submitted": "open",
                    "answered": "done",
                    "closed": "done",
                }.get(pin.rfi_id.state, "open")
            pin.status = status
            pin.color = PIN_COLORS.get(bucket, PIN_COLORS["default"])

    def action_open_target(self):
        self.ensure_one()
        if self.pin_type == "task" and self.task_id:
            return self._target_action("project.task", self.task_id.id)
        if self.pin_type == "rfi" and self.rfi_id:
            return self._target_action("construction.rfi", self.rfi_id.id)
        return False

    def _target_action(self, model, res_id):
        return {
            "type": "ir.actions.act_window",
            "res_model": model,
            "res_id": res_id,
            "view_mode": "form",
            "target": "current",
        }

    # ------------------------------------------------------------------
    # Plan-viewer RPC helpers (called by the OWL client action)
    # ------------------------------------------------------------------
    @api.model
    def _viewer_pin_fields(self):
        return ["id", "name", "pos_x", "pos_y", "pin_type", "status", "color",
                "task_id", "rfi_id"]

    @api.model
    def get_plan_data(self, revision_id):
        """Return the revision metadata + its pins for the plan viewer."""
        revision = self.env["construction.drawing.revision"].browse(revision_id)
        revision.check_access("read")
        pins = self.search([("revision_id", "=", revision_id)])
        siblings = self.env["construction.drawing.revision"].search(
            [("project_id", "=", revision.project_id.id)]
        )
        return {
            "revision": {
                "id": revision.id,
                "label": revision.display_name,
                "attachment_id": revision.attachment_id.id or False,
                "project_id": revision.project_id.id,
                "project_name": revision.project_id.display_name,
            },
            "revisions": [
                {"id": r.id, "label": r.display_name} for r in siblings
            ],
            "pins": pins.read(self._viewer_pin_fields()),
        }

    @api.model
    def create_pin_with_target(self, revision_id, pos_x, pos_y, pin_type, name,
                               description=None):
        """Create a pin and, for task/rfi pins, the linked record too."""
        revision = self.env["construction.drawing.revision"].browse(revision_id)
        project = revision.project_id
        vals = {
            "revision_id": revision_id,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "pin_type": pin_type,
            "name": name,
        }
        if pin_type == "task":
            task = self.env["project.task"].create(
                {"name": name, "project_id": project.id}
            )
            vals["task_id"] = task.id
        elif pin_type == "rfi":
            rfi = self.env["construction.rfi"].create(
                {
                    "name": name,
                    "project_id": project.id,
                    "question": description or "<p></p>",
                }
            )
            vals["rfi_id"] = rfi.id
        elif pin_type == "note":
            vals["note"] = description
        pin = self.create(vals)
        return pin.read(self._viewer_pin_fields())[0]
