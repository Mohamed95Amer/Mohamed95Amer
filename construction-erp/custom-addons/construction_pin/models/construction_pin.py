from odoo import api, fields, models
from odoo.exceptions import ValidationError


# Bootstrap colour indexes (Odoo kanban palette) per pin status.
PIN_COLORS = {
    "open": 1,        # red
    "in_progress": 3,  # amber
    "done": 10,       # green
    "info": 4,        # blue
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
        selection="_selection_pin_type",
        default="note",
        required=True,
    )
    task_id = fields.Many2one("project.task", ondelete="cascade")
    rfi_id = fields.Many2one("construction.rfi", ondelete="cascade")
    note = fields.Text()
    status = fields.Char(compute="_compute_status_color")
    color = fields.Integer(compute="_compute_status_color")
    status_bucket = fields.Char(
        compute="_compute_status_color",
        help="Semantic colour bucket for the viewer: open / in_progress / "
        "done / info.",
    )

    # ------------------------------------------------------------------
    # Pin-type registry — extended by modules that add new pinnable records
    # (e.g. construction_defect). Keeps the OWL viewer data-driven so new
    # types appear without touching JS.
    # ------------------------------------------------------------------
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

    @api.model
    def _selection_pin_type(self):
        return [(e["id"], e["label"]) for e in self._pin_type_registry()]

    def _pin_target_vals(self, pin_type, name, description, project):
        """Values used to create the linked record for a new pin."""
        if pin_type == "task":
            return {"name": name, "project_id": project.id}
        if pin_type == "rfi":
            return {"name": name, "project_id": project.id,
                    "question": description or "<p></p>"}
        return {}

    def _pin_status(self):
        """Return (status_label, colour_bucket) for one pin. Sub-modules
        override with a super() fallback to cover their own pin types."""
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
        return self.env._("Note"), "info"

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
            label, bucket = pin._pin_status()
            pin.status = label
            pin.color = PIN_COLORS.get(bucket, PIN_COLORS["default"])
            pin.status_bucket = bucket

    def action_open_target(self):
        self.ensure_one()
        entry = {e["id"]: e for e in self._pin_type_registry()}.get(self.pin_type)
        if entry and entry.get("link_field"):
            target = self[entry["link_field"]]
            if target:
                return self._target_action(entry["model"], target.id)
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
        fields_list = ["id", "name", "pos_x", "pos_y", "pin_type", "status",
                       "color", "status_bucket"]
        for entry in self._pin_type_registry():
            if entry.get("link_field") and entry["link_field"] not in fields_list:
                fields_list.append(entry["link_field"])
        return fields_list

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
            "pin_types": [
                {"id": e["id"], "label": e["label"], "icon": e["icon"]}
                for e in self._pin_type_registry()
            ],
            "pins": pins.read(self._viewer_pin_fields()),
        }

    @api.model
    def create_pin_with_target(self, revision_id, pos_x, pos_y, pin_type, name,
                               description=None):
        """Create a pin and, when the type has a target model, the linked
        record too."""
        revision = self.env["construction.drawing.revision"].browse(revision_id)
        project = revision.project_id
        vals = {
            "revision_id": revision_id,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "pin_type": pin_type,
            "name": name,
        }
        entry = {e["id"]: e for e in self._pin_type_registry()}.get(pin_type)
        if entry and entry.get("model"):
            target = self.env[entry["model"]].create(
                self._pin_target_vals(pin_type, name, description, project)
            )
            vals[entry["link_field"]] = target.id
        else:
            vals["note"] = description
        pin = self.create(vals)
        return pin.read(self._viewer_pin_fields())[0]
