"""BCF 2.1 — the format BIM issues travel in between tools.

A pin is worth little if it only exists here. The people who answer them work
in Solibri, Navisworks, Revit, Tekla or BIMcollab, and every one of those reads
and writes BCF: a zip of one folder per topic, each holding a markup.bcf (what
the issue is) and a viewpoint.bcfv (where to stand to see it).

This is a deliberate subset — topics, comments, viewpoints and the components
they select. Not implemented: BCF's project and extension schemas, which
describe a server-side issue-tracking API rather than a file, and would be
answering a question nobody asked of a file exchange.

Reference: BCF-XML 2.1, buildingSMART.
"""

import base64
import io
import logging
import uuid
import zipfile
from xml.etree import ElementTree

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Guard: a BCF is a handful of XML files. Anything this size is not one, and
# unzipping it would be somebody else's denial of service.
MAX_BCF_BYTES = 50 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024

BCF_VERSION = "2.1"

# BCF topic status <-> our buckets. BCF's vocabulary is not fixed by the
# standard (each server declares its own), so these are the conventional
# buildingSMART defaults rather than anything we can rely on reading back.
STATUS_BY_BUCKET = {
    "blocked": "Open",
    "open": "Open",
    "done": "Closed",
    "none": "Open",
}
TOPIC_TYPE_BY_PIN = {
    "note": "Comment",
    "task": "Request",
    "rfi": "Issue",
    "defect": "Fault",
}
# Reading back: whatever a foreign tool called it, decide whether it is done.
CLOSED_STATUSES = {"closed", "resolved", "done", "approved"}


def _text(parent, tag, value):
    node = ElementTree.SubElement(parent, tag)
    node.text = str(value if value is not None else "")
    return node


def _iso(value):
    """A datetime as BCF wants it: ISO 8601 with a zone."""
    return f"{fields.Datetime.to_string(value).replace(' ', 'T')}Z" if value else ""


class ConstructionBimBcf(models.AbstractModel):
    """Read and write BCF archives for a model's pins."""

    _name = "construction.bim.bcf"
    _description = "BCF Exchange"

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------
    @api.model
    def export_pins(self, pins):
        """Build a .bcfzip for these pins. Returns bytes."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("bcf.version", self._version_xml())
            for pin in pins:
                guid = pin._bcf_guid()
                archive.writestr(f"{guid}/markup.bcf", self._markup_xml(pin, guid))
                archive.writestr(f"{guid}/viewpoint.bcfv", self._viewpoint_xml(pin))
        return buffer.getvalue()

    @api.model
    def _version_xml(self):
        root = ElementTree.Element("Version", {"VersionId": BCF_VERSION})
        _text(root, "DetailedVersion", BCF_VERSION)
        return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)

    @api.model
    def _markup_xml(self, pin, guid):
        root = ElementTree.Element("Markup")
        topic = ElementTree.SubElement(root, "Topic", {
            "Guid": guid,
            "TopicType": TOPIC_TYPE_BY_PIN.get(pin.pin_type, "Issue"),
            "TopicStatus": STATUS_BY_BUCKET.get(pin.bucket, "Open"),
        })
        _text(topic, "Title", pin.name)
        _text(topic, "CreationDate", _iso(pin.create_date))
        _text(topic, "CreationAuthor", pin.author_id.email or pin.author_id.name or "")
        if pin.note:
            _text(topic, "Description", pin.note)
        # Where in the job. A reviewer opening the file in Solibri sees the
        # storey without having to work out which model it came from.
        if pin.storey:
            label = ElementTree.SubElement(topic, "Labels")
            label.text = pin.storey

        record = pin._linked_record()
        if record is not None and getattr(record, "date_required", False):
            _text(topic, "DueDate", str(record.date_required))

        comment_text = pin._bcf_comment()
        if comment_text:
            comment = ElementTree.SubElement(
                root, "Comment", {"Guid": str(uuid.uuid4())})
            _text(comment, "Date", _iso(pin.create_date))
            _text(comment, "Author",
                  pin.author_id.email or pin.author_id.name or "")
            _text(comment, "Comment", comment_text)

        viewpoints = ElementTree.SubElement(
            root, "Viewpoints", {"Guid": str(uuid.uuid4())})
        _text(viewpoints, "Viewpoint", "viewpoint.bcfv")
        return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)

    @api.model
    def _viewpoint_xml(self, pin):
        root = ElementTree.Element("VisualizationInfo", {
            "Guid": str(uuid.uuid4())})

        if pin.global_id:
            components = ElementTree.SubElement(root, "Components")
            selection = ElementTree.SubElement(components, "Selection")
            ElementTree.SubElement(selection, "Component", {
                "IfcGuid": pin.global_id,
                "OriginatingSystem": "Majal ERP",
            })
            visibility = ElementTree.SubElement(
                components, "Visibility", {"DefaultVisibility": "true"})
            ElementTree.SubElement(visibility, "ViewSetupHints", {
                "SpacesVisible": "false",
                "SpaceBoundariesVisible": "false",
                "OpeningsVisible": "false",
            })

        camera = ElementTree.SubElement(root, "PerspectiveCamera")
        position = pin._camera_position()
        direction = pin._camera_direction()
        self._point(camera, "CameraViewPoint", position)
        self._point(camera, "CameraDirection", direction)
        # Y is up in the viewer's space, and BCF stores whatever the authoring
        # tool used; keeping the viewer's own convention means a round trip
        # through this module lands the camera exactly where it started.
        self._point(camera, "CameraUpVector", (0.0, 1.0, 0.0))
        _text(camera, "FieldOfView", 60)
        return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)

    @api.model
    def _point(self, parent, tag, xyz):
        node = ElementTree.SubElement(parent, tag)
        for axis, value in zip(("X", "Y", "Z"), xyz):
            _text(node, axis, round(value, 6))
        return node

    # ------------------------------------------------------------------
    # Import
    # ------------------------------------------------------------------
    @api.model
    def import_archive(self, model, payload):
        """Read a .bcfzip into pins on this model. Returns the created pins."""
        if len(payload) > MAX_BCF_BYTES:
            raise UserError(_("That file is too large to be a BCF archive."))
        pin_model = self.env["construction.bim.pin"]
        created = pin_model.browse()
        try:
            archive = zipfile.ZipFile(io.BytesIO(payload))
        except zipfile.BadZipFile as err:
            raise UserError(
                _("That file is not a BCF archive (a BCF is a zip).")) from err

        with archive:
            total = sum(info.file_size for info in archive.infolist())
            if total > MAX_UNCOMPRESSED_BYTES:
                raise UserError(_("That archive expands to far more than a BCF "
                                  "should. It has not been read."))
            markups = [n for n in archive.namelist() if n.endswith("markup.bcf")]
            if not markups:
                raise UserError(_(
                    "No topics found. A BCF archive holds one folder per topic, "
                    "each containing a markup.bcf."))
            for name in markups:
                folder = name.rsplit("/", 1)[0] if "/" in name else ""
                try:
                    values = self._read_topic(archive, name, folder)
                except ElementTree.ParseError as err:
                    _logger.warning("Skipping unreadable BCF topic %s: %s", name, err)
                    continue
                if not values:
                    continue
                created |= pin_model._create_from_bcf(model, values)
        return created

    @api.model
    def _read_topic(self, archive, markup_name, folder):
        """Pull one topic out of the archive."""
        root = ElementTree.fromstring(archive.read(markup_name))
        topic = root.find("Topic")
        if topic is None:
            return {}
        status = (topic.get("TopicStatus") or "").strip().lower()
        values = {
            "guid": topic.get("Guid") or "",
            "title": (topic.findtext("Title") or "").strip(),
            "description": (topic.findtext("Description") or "").strip(),
            "closed": status in CLOSED_STATUSES,
            "global_id": "",
            "position": None,
            "camera": None,
            "target": None,
        }
        comments = [
            (c.findtext("Comment") or "").strip() for c in root.findall("Comment")]
        comments = [c for c in comments if c]
        if comments and not values["description"]:
            values["description"] = comments[0]

        viewpoint_name = root.findtext("Viewpoints/Viewpoint")
        if viewpoint_name:
            path = f"{folder}/{viewpoint_name}" if folder else viewpoint_name
            if path in archive.namelist():
                values.update(self._read_viewpoint(archive.read(path)))
        return values

    @api.model
    def _read_viewpoint(self, payload):
        root = ElementTree.fromstring(payload)
        found = {}
        component = root.find("Components/Selection/Component")
        if component is not None:
            # BCF 2.0 wrote the GlobalId as an element, 2.1 as an attribute.
            found["global_id"] = (
                component.get("IfcGuid") or component.findtext("IfcGuid") or "")

        camera = root.find("PerspectiveCamera")
        if camera is None:
            camera = root.find("OrthogonalCamera")
        if camera is not None:
            position = self._read_point(camera.find("CameraViewPoint"))
            direction = self._read_point(camera.find("CameraDirection"))
            if position:
                found["camera"] = position
                # BCF stores a direction, not a target. The pin needs somewhere
                # to sit, so the target is taken a sensible distance along it.
                if direction:
                    found["target"] = tuple(
                        p + d * 10.0 for p, d in zip(position, direction))
                    found["position"] = found["target"]
        return found

    @api.model
    def _read_point(self, node):
        if node is None:
            return None
        try:
            return tuple(
                float(node.findtext(axis) or 0.0) for axis in ("X", "Y", "Z"))
        except (TypeError, ValueError):
            return None


class ConstructionBimBcfWizard(models.TransientModel):
    """Upload a BCF archive against a model."""

    _name = "construction.bim.bcf.import"
    _description = "Import BCF"

    model_id = fields.Many2one(
        "construction.bim.model", required=True, ondelete="cascade")
    bcf_file = fields.Binary(string="BCF Archive", required=True)
    bcf_filename = fields.Char()

    def action_import(self):
        self.ensure_one()
        pins = self.env["construction.bim.bcf"].import_archive(
            self.model_id, base64.b64decode(self.bcf_file))
        if not pins:
            raise UserError(_("No topics could be read from that archive."))
        self.model_id.message_post(body=_(
            "%(count)s topic(s) imported from %(name)s.",
            count=len(pins), name=self.bcf_filename or "BCF"))
        return {
            "type": "ir.actions.act_window",
            "name": _("Imported Topics"),
            "res_model": "construction.bim.pin",
            "views": [[False, "list"], [False, "form"]],
            "domain": [("id", "in", pins.ids)],
        }
