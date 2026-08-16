import base64
import binascii

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import image_process

# Kanban colour indexes per semantic status bucket.
PIN_COLORS = {
    "open": 1,        # red
    "in_progress": 3,  # amber
    "done": 10,       # green
    "info": 4,        # blue
    "default": 0,
}


class PlanPinMixin(models.AbstractModel):
    """Reusable pin-on-plan behaviour shared by every pin model (construction
    drawing pins, facility floor-plan pins, …). A concrete model sets
    ``_sheet_field`` (the m2o to its 'sheet' record) and ``_sheet_model``, and
    optionally overrides the pin-type registry, status and sheet helpers.

    The OWL Plan Viewer drives any such model through three RPCs:
    ``get_plan_data``, ``create_pin_with_target`` and ``action_open_target``.
    """

    _name = "plan.pin.mixin"
    _description = "Plan Pin Mixin"

    # Concrete models override these two.
    _sheet_field = "sheet_id"
    _sheet_model = False

    name = fields.Char(required=True, default="Pin")
    pos_x = fields.Float(required=True, digits=(12, 9))
    pos_y = fields.Float(required=True, digits=(12, 9))
    pin_type = fields.Selection(
        selection="_selection_pin_type", default="note", required=True)
    note = fields.Text()
    # A photograph of what the pin is pointing at. On site this is usually the
    # whole content of the observation — a crack, a missing handrail, a wrong
    # fitting — and describing it in a note is a poor substitute for showing
    # it. max_width/max_height make Odoo resize on write, so a modern phone
    # camera does not put a 12-megapixel original in the filestore.
    photo = fields.Image(string="Photo", max_width=1920, max_height=1920)
    # Sent to the plan viewer instead of the image itself. The viewer loads
    # every pin on a sheet at once, so shipping the bytes for each would make
    # opening a busy drawing far heavier than looking at one photograph. The
    # flag draws the indicator; /web/image fetches the picture when asked.
    has_photo = fields.Boolean(compute="_compute_has_photo", store=True)
    status = fields.Char(compute="_compute_status_color")
    color = fields.Integer(compute="_compute_status_color")
    status_bucket = fields.Char(compute="_compute_status_color")

    # ------------------------------------------------------------------
    # Pin-type registry (extended by modules that add pinnable records)
    # ------------------------------------------------------------------
    @api.model
    def _pin_type_registry(self):
        return [
            {"id": "note", "label": self.env._("Note"),
             "icon": "fa-sticky-note", "model": False, "link_field": False},
        ]

    @api.model
    def _selection_pin_type(self):
        return [(e["id"], e["label"]) for e in self._pin_type_registry()]

    def _pin_target_vals(self, pin_type, name, description, sheet):
        """Values used to create the linked record for a new pin. Concrete
        models override per type, with a super() fallback."""
        return {}

    def _pin_status(self):
        """Return (status_label, colour_bucket) for one pin."""
        self.ensure_one()
        return self.env._("Note"), "info"

    @api.constrains("pos_x", "pos_y")
    def _check_coords(self):
        for pin in self:
            if not (0.0 <= pin.pos_x <= 1.0) or not (0.0 <= pin.pos_y <= 1.0):
                raise ValidationError(
                    self.env._("Pin coordinates must be normalized between 0 and 1."))

    @api.depends("photo")
    def _compute_has_photo(self):
        for pin in self:
            pin.has_photo = bool(pin.photo)

    @api.depends("pin_type")
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
                return {
                    "type": "ir.actions.act_window",
                    "res_model": entry["model"],
                    "res_id": target.id,
                    "view_mode": "form",
                    "target": "current",
                }
        return False

    # ------------------------------------------------------------------
    # Sheet helpers — concrete models override to describe their 'sheet'
    # ------------------------------------------------------------------
    def _sheet_label(self, sheet):
        return sheet.display_name

    def _sheet_attachment_id(self, sheet):
        return getattr(sheet, "attachment_id", False) and sheet.attachment_id.id

    def _sheet_context_name(self, sheet):
        return sheet.display_name

    def _sibling_sheets(self, sheet):
        return sheet

    # ------------------------------------------------------------------
    # Plan-viewer RPCs
    # ------------------------------------------------------------------
    @api.model
    def _viewer_pin_fields(self):
        # has_photo, never photo — see the field's comment. The viewer draws an
        # indicator from the flag and fetches the picture from /web/image only
        # when somebody opens that pin.
        fields_list = ["id", "name", "pos_x", "pos_y", "pin_type", "status",
                       "color", "status_bucket", "has_photo"]
        for entry in self._pin_type_registry():
            if entry.get("link_field") and entry["link_field"] not in fields_list:
                fields_list.append(entry["link_field"])
        return fields_list

    @api.model
    def _validated_photo(self, photo):
        """Refuse an oversized upload before it reaches the image pipeline.

        fields.Image resizes on write, but the resize happens *after* the
        whole payload has been decoded in memory — so the ceiling has to be
        applied to what arrives, not to what is stored. A current phone camera
        produces a few megabytes; the limit is set well above that and well
        below a figure that threatens the worker.

        It is also the point where a file that is not an image is rejected.
        fields.Image would raise on it anyway, but with a traceback about PIL
        rather than a sentence a site engineer can act on.
        """
        raw = photo.encode() if isinstance(photo, str) else photo
        ceiling = int(float(
            self.env["ir.config_parameter"].sudo()
            .get_param("construction_pin.max_photo_mb", 12)) * 1024 * 1024)
        # base64 carries roughly four bytes for every three of payload.
        if len(raw) * 3 // 4 > ceiling:
            raise ValidationError(self.env._(
                "That photograph is larger than the %(limit)s MB limit.",
                limit=round(ceiling / (1024 * 1024), 1)))
        try:
            image_process(base64.b64decode(raw), verify_resolution=True)
        except (UserError, ValueError, TypeError, binascii.Error):
            raise ValidationError(self.env._(
                "That file is not an image Majal can read. Use a JPEG or PNG."))
        return raw

    @api.model
    def get_plan_data(self, sheet_id):
        sheet = self.env[self._sheet_model].browse(sheet_id)
        sheet.check_access("read")
        pins = self.search([(self._sheet_field, "=", sheet_id)])
        siblings = self._sibling_sheets(sheet)
        return {
            "sheet": {
                "id": sheet.id,
                "label": self._sheet_label(sheet),
                "attachment_id": self._sheet_attachment_id(sheet) or False,
                "context_name": self._sheet_context_name(sheet),
                "sheet_model": self._sheet_model,
            },
            "sheets": [
                {"id": s.id, "label": self._sheet_label(s)} for s in siblings],
            "pin_types": [
                {"id": e["id"], "label": e["label"], "icon": e["icon"]}
                for e in self._pin_type_registry()],
            "pins": pins.read(self._viewer_pin_fields()),
        }

    @api.model
    def create_pin_with_target(self, sheet_id, pos_x, pos_y, pin_type, name,
                               description=None, photo=None):
        sheet = self.env[self._sheet_model].browse(sheet_id)
        vals = {
            self._sheet_field: sheet_id,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "pin_type": pin_type,
            "name": name,
        }
        if photo:
            vals["photo"] = self._validated_photo(photo)
        entry = {e["id"]: e for e in self._pin_type_registry()}.get(pin_type)
        if entry and entry.get("model"):
            target = self.env[entry["model"]].create(
                self._pin_target_vals(pin_type, name, description, sheet))
            vals[entry["link_field"]] = target.id
        else:
            vals["note"] = description
        pin = self.create(vals)
        return pin.read(self._viewer_pin_fields())[0]
