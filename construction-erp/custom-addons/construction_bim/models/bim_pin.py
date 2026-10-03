import uuid

from odoo import api, fields, models

# Same buckets and colours as element links, so a pin and a coloured element
# mean the same thing at a glance.
BUCKET_ORDER = ("blocked", "open", "done", "none")


class ConstructionBimPin(models.Model):
    """A point on the model, with a record attached to it.

    Element links answer "which wall is this about". A pin answers "where on
    it" — the crack at the third window from the left, not the whole facade.
    Both are needed: the element link survives a re-export because GlobalId
    does, and the pin gives the site engineer somewhere to point.

    Coordinates are stored in the model's own space, not in screen space, so a
    pin stays on the crack while the camera moves. That is the whole difference
    between this and drawing on a screenshot.
    """

    _name = "construction.bim.pin"
    _description = "BIM Pin"
    _order = "sequence, id"

    model_id = fields.Many2one(
        "construction.bim.model", required=True, ondelete="cascade", index=True)
    project_id = fields.Many2one(
        related="model_id.project_id", store=True, index=True)
    element_id = fields.Many2one(
        "construction.bim.element", ondelete="set null", index=True,
        help="Element the pin was dropped on, when the click landed on one.")
    global_id = fields.Char(
        string="Element GlobalId", readonly=True,
        help="Kept alongside the element link so a pin survives the element "
             "record being rebuilt.")

    sequence = fields.Integer(default=10)
    name = fields.Char(required=True, default="Pin")
    note = fields.Text()

    # Model-space coordinates. Floats rather than a single serialised string:
    # a pin outside the model's bounds is then a query, not a parsing job.
    pos_x = fields.Float(digits=(16, 4), required=True)
    pos_y = fields.Float(digits=(16, 4), required=True)
    pos_z = fields.Float(digits=(16, 4), required=True)
    storey = fields.Char(index=True)

    # The camera the pin was dropped from. A position on its own says where
    # something is; the viewpoint says what the person was looking at when they
    # decided it was a problem, which is most of what a reviewer needs and is
    # exactly what BCF carries between tools.
    cam_x = fields.Float(digits=(16, 4))
    cam_y = fields.Float(digits=(16, 4))
    cam_z = fields.Float(digits=(16, 4))
    cam_target_x = fields.Float(digits=(16, 4))
    cam_target_y = fields.Float(digits=(16, 4))
    cam_target_z = fields.Float(digits=(16, 4))
    has_viewpoint = fields.Boolean(compute="_compute_has_viewpoint", store=True)

    pin_type = fields.Selection(
        selection="_selection_pin_type", default="note", required=True)
    task_id = fields.Many2one("project.task", ondelete="cascade")
    rfi_id = fields.Many2one("construction.rfi", ondelete="cascade")
    defect_id = fields.Many2one("construction.defect", ondelete="cascade")

    author_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, readonly=True)
    status = fields.Char(compute="_compute_status", store=True)
    bucket = fields.Selection(
        [("blocked", "Blocked"), ("open", "Open"), ("done", "Done"),
         ("none", "Note")],
        compute="_compute_status", store=True, default="none",
    )

    @api.model
    def _pin_type_registry(self):
        """What a pin can be. Extended the same way the drawing pins are."""
        return [
            {"id": "note", "label": self.env._("Note"), "icon": "fa-sticky-note",
             "model": False, "link_field": False},
            {"id": "task", "label": self.env._("Task"), "icon": "fa-wrench",
             "model": "project.task", "link_field": "task_id"},
            {"id": "rfi", "label": self.env._("RFI"), "icon": "fa-question",
             "model": "construction.rfi", "link_field": "rfi_id"},
            {"id": "defect", "label": self.env._("Defect"), "icon": "fa-exclamation-triangle",
             "model": "construction.defect", "link_field": "defect_id"},
        ]

    @api.model
    def _selection_pin_type(self):
        return [(entry["id"], entry["label"]) for entry in self._pin_type_registry()]

    @api.depends("cam_x", "cam_y", "cam_z", "cam_target_x", "cam_target_y",
                 "cam_target_z")
    def _compute_has_viewpoint(self):
        for pin in self:
            # An all-zero camera is the absence of one, not a camera at the
            # origin: nobody reviews a model from inside the survey point.
            pin.has_viewpoint = any((
                pin.cam_x, pin.cam_y, pin.cam_z,
                pin.cam_target_x, pin.cam_target_y, pin.cam_target_z,
            ))

    @api.depends("pin_type", "task_id.state", "rfi_id.state", "defect_id.state")
    def _compute_status(self):
        for pin in self:
            if pin.pin_type == "rfi" and pin.rfi_id:
                pin.status = dict(
                    pin.rfi_id._fields["state"].selection).get(pin.rfi_id.state, "")
                pin.bucket = ("done" if pin.rfi_id.state in ("closed", "cancelled")
                              else "blocked")
            elif pin.pin_type == "defect" and pin.defect_id:
                pin.status = dict(
                    pin.defect_id._fields["state"].selection).get(
                        pin.defect_id.state, "")
                pin.bucket = ("done" if pin.defect_id.state in ("closed", "cancelled")
                              else "open")
            elif pin.pin_type == "task" and pin.task_id:
                pin.status = pin.task_id.state or ""
                pin.bucket = ("done" if pin.task_id.state in ("1_done", "1_canceled")
                              else "open")
            else:
                pin.status = ""
                pin.bucket = "none"

    def action_open_record(self):
        self.ensure_one()
        for entry in self._pin_type_registry():
            field = entry["link_field"]
            if field and self[field]:
                return {
                    "type": "ir.actions.act_window",
                    "name": self[field].display_name,
                    "res_model": entry["model"],
                    "res_id": self[field].id,
                    # views, not view_mode alone: the client preprocesses the
                    # action and needs the descriptor, and an action built here
                    # has no ir.actions record to fall back on.
                    "views": [[False, "form"]],
                    "view_mode": "form",
                    # In a dialog, so opening a defect does not throw away the
                    # camera position the pin was found from.
                    "target": "new",
                }
        return False

    # ------------------------------------------------------------------
    # Called from the viewer
    # ------------------------------------------------------------------
    @api.model
    def drop_pin(self, model_id, values):
        """Create a pin, and the record it points at, in one round trip.

        The viewer is a 3D canvas: making the user place a pin, then open a
        form, then come back and link them would lose the position and most of
        the point. The record is created here with the model's project already
        filled in, because a pin always knows which job it is on.
        """
        model = self.env["construction.bim.model"].browse(model_id).exists()
        if not model:
            return {}

        pin_type = values.get("pin_type") or "note"
        name = (values.get("name") or "").strip() or self.env._("Pin")
        element = self.env["construction.bim.element"]
        global_id = values.get("global_id")
        if global_id:
            element = element.search(
                [("model_id", "=", model.id), ("global_id", "=", global_id)],
                limit=1)

        pin_values = {
            "model_id": model.id,
            "element_id": element.id if element else False,
            "global_id": global_id or False,
            "name": name,
            "note": values.get("note") or False,
            "pos_x": values.get("pos_x") or 0.0,
            "pos_y": values.get("pos_y") or 0.0,
            "pos_z": values.get("pos_z") or 0.0,
            "storey": element.storey if element else False,
            "pin_type": pin_type,
        }
        for key in ("cam_x", "cam_y", "cam_z",
                    "cam_target_x", "cam_target_y", "cam_target_z"):
            pin_values[key] = values.get(key) or 0.0
        pin_values.update(self._create_linked_record(model, pin_type, name, values))
        pin = self.create(pin_values)
        return pin._payload()

    def _create_linked_record(self, model, pin_type, name, values):
        """Spawn the task, RFI or defect a pin of that type stands for."""
        project = model.project_id
        note = values.get("note") or ""
        if pin_type == "task":
            task = self.env["project.task"].create(
                {"name": name, "project_id": project.id, "description": note})
            return {"task_id": task.id}
        if pin_type == "rfi":
            rfi = self.env["construction.rfi"].create({
                "name": name, "project_id": project.id,
                "question": note or name,
            })
            return {"rfi_id": rfi.id}
        if pin_type == "defect":
            defect = self.env["construction.defect"].create({
                "name": name, "project_id": project.id, "description": note,
            })
            return {"defect_id": defect.id}
        return {}

    def _payload(self):
        """The shape the viewer draws."""
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "note": self.note or "",
            "pin_type": self.pin_type,
            "bucket": self.bucket,
            "status": self.status or "",
            "storey": self.storey or "",
            "global_id": self.global_id or "",
            "position": [self.pos_x, self.pos_y, self.pos_z],
            "has_viewpoint": self.has_viewpoint,
            "camera": (
                [self.cam_x, self.cam_y, self.cam_z] if self.has_viewpoint
                else None),
            "camera_target": (
                [self.cam_target_x, self.cam_target_y, self.cam_target_z]
                if self.has_viewpoint else None),
        }

    @api.model
    def pins_for_model(self, model_id):
        return [pin._payload() for pin in self.search([("model_id", "=", model_id)])]

    # ------------------------------------------------------------------
    # BCF
    # ------------------------------------------------------------------
    bcf_guid = fields.Char(
        readonly=True, copy=False, index=True,
        help="Topic GUID this pin came from, or was last exported as, so a "
             "round trip through another tool updates the pin rather than "
             "creating a second one beside it.")

    def _bcf_guid(self):
        """The topic GUID, minted once and then kept.

        Stability is the whole point: re-exporting must produce the same topic
        so a reviewer's answer lands on the issue they answered, not on a new
        one that looks identical.
        """
        self.ensure_one()
        if not self.bcf_guid:
            self.bcf_guid = str(uuid.uuid4())
        return self.bcf_guid

    def _linked_record(self):
        self.ensure_one()
        for entry in self._pin_type_registry():
            field = entry["link_field"]
            if field and self[field]:
                return self[field]
        return None

    def _bcf_comment(self):
        """What the linked record adds beyond the pin's own note."""
        self.ensure_one()
        record = self._linked_record()
        if record is None:
            return ""
        parts = [record.display_name]
        if self.status:
            parts.append(self.env._("Status: %s", self.status))
        return " — ".join(parts)

    def _camera_position(self):
        self.ensure_one()
        if self.has_viewpoint:
            return (self.cam_x, self.cam_y, self.cam_z)
        # No stored viewpoint: stand back from the pin along a fixed diagonal so
        # the exported topic still opens on something rather than inside a wall.
        return (self.pos_x + 8.0, self.pos_y + 6.0, self.pos_z + 8.0)

    def _camera_direction(self):
        self.ensure_one()
        position = self._camera_position()
        target = (
            (self.cam_target_x, self.cam_target_y, self.cam_target_z)
            if self.has_viewpoint else (self.pos_x, self.pos_y, self.pos_z))
        vector = [t - p for t, p in zip(target, position)]
        length = sum(v * v for v in vector) ** 0.5
        return tuple(v / length for v in vector) if length else (0.0, 0.0, -1.0)

    @api.model
    def _create_from_bcf(self, model, values):
        """Create or update the pin a BCF topic describes.

        Matched on the topic GUID: a file that has been round-tripped through a
        reviewer's tool carries the same GUIDs, and importing it must update
        those issues rather than duplicate every one of them.
        """
        title = values.get("title") or self.env._("Imported topic")
        guid = values.get("guid") or ""
        existing = self.search(
            [("model_id", "=", model.id), ("bcf_guid", "=", guid)], limit=1
        ) if guid else self.browse()

        position = values.get("position") or (0.0, 0.0, 0.0)
        camera = values.get("camera") or (0.0, 0.0, 0.0)
        target = values.get("target") or (0.0, 0.0, 0.0)
        element = self.env["construction.bim.element"]
        if values.get("global_id"):
            element = element.search([
                ("model_id", "=", model.id),
                ("global_id", "=", values["global_id"]),
            ], limit=1)

        pin_values = {
            "model_id": model.id,
            "name": title,
            "note": values.get("description") or False,
            "bcf_guid": guid or False,
            "global_id": values.get("global_id") or False,
            "element_id": element.id if element else False,
            "storey": element.storey if element else False,
            "pos_x": position[0], "pos_y": position[1], "pos_z": position[2],
            "cam_x": camera[0], "cam_y": camera[1], "cam_z": camera[2],
            "cam_target_x": target[0], "cam_target_y": target[1],
            "cam_target_z": target[2],
        }
        if existing:
            # The type is not overwritten: a topic that was raised here as a
            # defect stays a defect even if the reviewer's tool called it
            # something from its own vocabulary.
            existing.write(pin_values)
            return existing

        pin_values["pin_type"] = "note"
        return self.create(pin_values)

    def remove_pin(self):
        """Delete the pin and, if it is only a note, nothing else.

        A pin standing for an RFI is a view of that RFI, not the RFI itself —
        deleting the marker must not delete a question somebody asked.
        """
        self.filtered(lambda p: p.pin_type == "note").unlink()
        return True
