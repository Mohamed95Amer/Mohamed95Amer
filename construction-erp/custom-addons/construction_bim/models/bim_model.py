import base64
import logging

from odoo import api, fields, models
from odoo.exceptions import UserError

from . import ifc_parser

_logger = logging.getLogger(__name__)

# Guard against someone attaching a 2 GB federated model and taking the worker
# down with it. Indexing is line-based and cheap, but not free.
MAX_INDEX_BYTES = 300 * 1024 * 1024


class ConstructionBimModel(models.Model):
    """An IFC model belonging to a project.

    The file itself is rendered in the browser; what the server keeps is an
    index of the elements inside it. That index is the point of the module: an
    IFC element has a GlobalId that survives every re-export, so a wall can
    carry the RFI raised against it through revision after revision of the
    model. Without the index, a BIM viewer is a picture — pretty, and unable to
    answer a single question about the job.
    """

    _name = "construction.bim.model"
    _description = "BIM Model"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "BIM"
    _order = "id desc"

    discipline = fields.Selection(
        [("architectural", "Architectural"), ("structural", "Structural"),
         ("mechanical", "Mechanical"), ("electrical", "Electrical"),
         ("plumbing", "Plumbing"), ("civil", "Civil"),
         ("federated", "Federated"), ("other", "Other")],
        default="architectural", required=True,
    )
    revision = fields.Char(default="A", required=True)
    ifc_file = fields.Binary(string="IFC File", attachment=True, required=True)
    ifc_filename = fields.Char(string="File Name")
    file_size = fields.Integer(readonly=True)

    state = fields.Selection(
        [("draft", "Uploaded"), ("indexed", "Indexed"), ("current", "Current"),
         ("superseded", "Superseded")],
        default="draft", tracking=True, group_expand="_group_expand_state",
    )
    element_ids = fields.One2many(
        "construction.bim.element", "model_id", string="Elements")
    element_count = fields.Integer(compute="_compute_counts", store=True)
    linked_count = fields.Integer(
        compute="_compute_counts", store=True, string="Linked Elements")
    index_error = fields.Char(readonly=True)

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("element_ids", "element_ids.is_linked")
    def _compute_counts(self):
        for model in self:
            model.element_count = len(model.element_ids)
            model.linked_count = len(model.element_ids.filtered("is_linked"))

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("superseded",)

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------
    def _ifc_bytes(self):
        self.ensure_one()
        if not self.ifc_file:
            return b""
        return base64.b64decode(self.ifc_file)

    def action_index(self):
        """Read the file and rebuild the element index.

        Existing links survive: elements are matched on GlobalId, which is
        exactly the identity IFC promises to keep stable across exports. A
        re-index after a model revision therefore keeps the RFI attached to the
        wall it was raised against, rather than orphaning every link because
        the internal step numbers moved.
        """
        element_model = self.env["construction.bim.element"]
        for model in self:
            payload = model._ifc_bytes()
            if not payload:
                raise UserError(self.env._("Attach an IFC file first."))
            if len(payload) > MAX_INDEX_BYTES:
                raise UserError(self.env._(
                    "This model is %(size)s MB. Split it by discipline before "
                    "indexing.", size=len(payload) // (1024 * 1024)))
            try:
                elements, storeys = ifc_parser.parse(payload)
            except Exception as err:
                model.write({"index_error": str(err)[:500]})
                _logger.exception("Could not index IFC model %s", model.display_name)
                raise UserError(self.env._(
                    "The file could not be read as IFC: %s", err)) from err

            existing = {e.global_id: e for e in model.element_ids}
            storey_names = {
                step_id: (data["name"] or data["global_id"])
                for step_id, data in storeys.items()
            }
            seen = set()
            to_create = []
            for element in elements:
                global_id = element["global_id"]
                seen.add(global_id)
                values = {
                    "model_id": model.id,
                    "global_id": global_id,
                    "step_id": element["step_id"],
                    "ifc_type": element["ifc_type"],
                    "name": element["name"] or element["ifc_type"],
                    "storey": storey_names.get(element["storey_step_id"], ""),
                }
                if global_id in existing:
                    existing[global_id].write(values)
                else:
                    to_create.append(values)
            if to_create:
                element_model.create(to_create)

            # An element that has gone from the model but carries links is kept
            # and flagged rather than deleted — losing the RFI history because
            # a wall was redrawn is not an improvement.
            gone = model.element_ids.filtered(lambda e: e.global_id not in seen)
            # Split before deleting: reading is_linked off a recordset that
            # already contains unlinked ids raises rather than returning False.
            orphaned = gone.filtered("is_linked")
            (gone - orphaned).unlink()
            orphaned.write({"is_orphan": True})

            model.write({
                "state": "indexed" if model.state == "draft" else model.state,
                "file_size": len(payload),
                "index_error": False,
            })
            model.message_post(body=self.env._(
                "Indexed %(count)s elements across %(storeys)s storey(s).",
                count=len(elements), storeys=len(storeys)))
        return True

    def action_make_current(self):
        for model in self:
            siblings = self.search([
                ("project_id", "=", model.project_id.id),
                ("discipline", "=", model.discipline),
                ("id", "!=", model.id),
                ("state", "=", "current"),
            ])
            siblings.write({"state": "superseded"})
            model.state = "current"

    def action_open_viewer(self):
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "construction_bim.viewer",
            "name": self.display_name,
            "params": {"model_id": self.id},
        }

    def action_view_elements(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Elements"),
            "res_model": "construction.bim.element",
            "view_mode": "list,form",
            "domain": [("model_id", "=", self.id)],
        }

    # ------------------------------------------------------------------
    # Viewer data
    # ------------------------------------------------------------------
    @api.model
    def viewer_payload(self, model_id):
        """Everything the viewer needs in one call."""
        model = self.browse(model_id).exists()
        if not model:
            return {}
        elements = self.env["construction.bim.element"].search_read(
            [("model_id", "=", model.id), ("is_linked", "=", True)],
            ["global_id", "name", "ifc_type", "storey", "link_summary",
             "link_bucket"],
        )
        return {
            "id": model.id,
            "name": model.display_name,
            "project": model.project_id.display_name,
            "discipline": model.discipline,
            "revision": model.revision,
            "element_count": model.element_count,
            "linked_count": model.linked_count,
            "file_url": f"/web/content/construction.bim.model/{model.id}/ifc_file",
            "linked": elements,
        }
