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
            properties_by_global_id = {}
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
                values.update(self._quantity_values(element["quantities"]))
                properties_by_global_id[global_id] = element["properties"]
                if global_id in existing:
                    existing[global_id].write(values)
                else:
                    to_create.append(values)
            if to_create:
                element_model.create(to_create)
            model._store_properties(properties_by_global_id)

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

    @api.model
    def _quantity_values(self, quantities):
        """Fold an element's quantity set into the columns we total.

        A model can carry several quantities of one kind — gross and net area,
        for instance — and the sum of them is meaningless. The largest is kept,
        which for the gross/net pair is the gross: the one a bill is measured
        against, and the one that does not silently under-report.
        """
        values = {
            "quantity_length": 0.0, "quantity_area": 0.0, "quantity_volume": 0.0,
            "quantity_count": 0.0, "quantity_weight": 0.0,
        }
        for kind, _name, value in quantities:
            field = f"quantity_{kind}"
            if field in values:
                values[field] = max(values[field], value)
        return values

    def _store_properties(self, properties_by_global_id):
        """Replace this model's property rows with what the file now says.

        Written wholesale rather than diffed: a property that disappeared from
        a revision has to disappear here too, and an element routinely carries
        thirty of them, so matching row by row costs more than rebuilding.
        """
        self.ensure_one()
        property_model = self.env["construction.bim.property"]
        property_model.search([("model_id", "=", self.id)]).unlink()
        elements = {e.global_id: e.id for e in self.element_ids}
        rows = []
        for global_id, properties in properties_by_global_id.items():
            element_id = elements.get(global_id)
            if not element_id:
                continue
            # Deduplicate: an element inheriting a property set from its type as
            # well as from itself would otherwise break the unique constraint.
            seen = set()
            for pset, name, value in properties:
                key = (pset, name)
                if key in seen:
                    continue
                seen.add(key)
                rows.append({
                    "element_id": element_id, "pset": pset,
                    "name": name, "value": value,
                })
        if rows:
            property_model.create(rows)
        return len(rows)

    # ------------------------------------------------------------------
    # BCF exchange
    # ------------------------------------------------------------------
    pin_ids = fields.One2many("construction.bim.pin", "model_id", string="Pins")
    pin_count = fields.Integer(compute="_compute_pin_count")

    def _compute_pin_count(self):
        counts = dict(self.env["construction.bim.pin"]._read_group(
            [("model_id", "in", self.ids)], ["model_id"], ["__count"]))
        for model in self:
            model.pin_count = counts.get(model, 0)

    def action_export_bcf(self):
        """Hand the model's issues to whoever is answering them.

        They work in Solibri, Navisworks or BIMcollab, and none of those will
        log in here to read a pin.
        """
        self.ensure_one()
        pins = self.pin_ids
        if not pins:
            raise UserError(self.env._("This model has no pins to export."))
        payload = self.env["construction.bim.bcf"].export_pins(pins)
        attachment = self.env["ir.attachment"].create({
            "name": f"{self.reference or self.display_name}.bcfzip",
            "type": "binary",
            "datas": base64.b64encode(payload),
            "res_model": self._name,
            "res_id": self.id,
            # A BCF is a zip. Saying so stops the browser sniffing the content,
            # deciding the extension is wrong and saving it as .bcfzip.zip —
            # which is then a file the receiving BIM tool will not open.
            "mimetype": "application/zip",
        })
        self.message_post(
            body=self.env._("%s issue(s) exported as BCF 2.1.", len(pins)),
            attachment_ids=attachment.ids,
        )
        return {
            "type": "ir.actions.act_url",
            "url": f"/web/content/{attachment.id}?download=true",
            "target": "self",
        }

    def action_import_bcf(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Import BCF"),
            "res_model": "construction.bim.bcf.import",
            "views": [[False, "form"]],
            "target": "new",
            "context": {"default_model_id": self.id},
        }

    def action_compare(self):
        """Compare this revision with the one it replaced."""
        self.ensure_one()
        previous = self.search([
            ("project_id", "=", self.project_id.id),
            ("discipline", "=", self.discipline),
            ("id", "!=", self.id),
        ], order="id desc", limit=1)
        comparison = self.env["construction.bim.comparison"].create({
            "base_model_id": previous.id,
            "target_model_id": self.id,
        })
        if previous:
            comparison.action_compare()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Compare Revisions"),
            "res_model": "construction.bim.comparison",
            "res_id": comparison.id,
            "views": [[False, "form"]],
            "target": "new",
        }

    def action_view_pins(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Pins"),
            "res_model": "construction.bim.pin",
            "view_mode": "list,form",
            "domain": [("model_id", "=", self.id)],
            "context": {"default_model_id": self.id},
        }

    def action_takeoff(self):
        """The model's own measurement, totalled by type and storey.

        A quantity surveyor's first question of any model. Grouped rather than
        listed because nobody wants nine hundred walls — they want how much
        blockwork is on level three.
        """
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Quantity Takeoff — %s", self.display_name),
            "res_model": "construction.bim.element",
            "views": [
                [self.env.ref("construction_bim.view_bim_element_takeoff").id, "list"],
                [False, "form"],
            ],
            "domain": [("model_id", "=", self.id), ("has_quantities", "=", True)],
            # Type first, storey second: a takeoff is read as "how much
            # blockwork, and where", not "what is on level three".
            "context": {
                "search_default_group_type": 1,
                "search_default_group_storey": 2,
            },
            "help": f"""<p class="o_view_nocontent_smiling_face">{
                self.env._("This model carries no quantities")}</p>
                <p>{self.env._(
                    "Quantities come from the IfcElementQuantity sets an "
                    "authoring tool writes when the model is exported with base "
                    "quantities enabled. Re-export with them switched on, then "
                    "index the file again.")}</p>""",
        }

    def action_view_properties(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Properties"),
            "res_model": "construction.bim.property",
            "view_mode": "list",
            "domain": [("model_id", "=", self.id)],
        }

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
    def _file_url(self):
        self.ensure_one()
        return f"/web/content/construction.bim.model/{self.id}/ifc_file"

    @api.model
    def federation_candidates(self, model_id):
        """The other models of this project that can be overlaid on this one.

        Superseded revisions are left out: coordinating against a drawing
        somebody has already replaced is how a clash gets designed around twice.
        """
        model = self.browse(model_id).exists()
        if not model:
            return []
        siblings = self.search([
            ("project_id", "=", model.project_id.id),
            ("id", "!=", model.id),
            ("state", "in", ("indexed", "current")),
        ])
        return [
            {
                "id": sibling.id,
                "name": sibling.display_name,
                "discipline": sibling.discipline,
                "file_url": sibling._file_url(),
            }
            for sibling in siblings
        ]

    @api.model
    def viewer_payload(self, model_id):
        """Everything the viewer needs in one call."""
        model = self.browse(model_id).exists()
        if not model:
            return {}
        elements = self.env["construction.bim.element"].search_read(
            [("model_id", "=", model.id), ("is_linked", "=", True)],
            ["global_id", "name", "ifc_type", "storey", "link_summary",
             "link_bucket", "quantity_volume", "quantity_area",
             "quantity_length", "quantity_count"],
        )
        # Storeys drive the level filter. Read from the index rather than the
        # file, so the viewer knows them before the geometry has parsed.
        storeys = [
            storey for storey, in self.env["construction.bim.element"]._read_group(
                [("model_id", "=", model.id), ("storey", "!=", False)],
                ["storey"],
            )
        ]
        return {
            "id": model.id,
            "name": model.display_name,
            "project": model.project_id.display_name,
            "discipline": model.discipline,
            "revision": model.revision,
            "element_count": model.element_count,
            "linked_count": model.linked_count,
            "file_url": model._file_url(),
            "federation": self.federation_candidates(model.id),
            "linked": elements,
            "storeys": sorted(s for s in storeys if s),
            "pins": self.env["construction.bim.pin"].pins_for_model(model.id),
            "pin_types": self.env["construction.bim.pin"]._pin_type_registry(),
            "schedule": model._schedule_payload(),
            "totals": model._quantity_totals(),
        }

    def _schedule_payload(self):
        """The programme, as far as the model knows it.

        4D is only worth having when it is the real programme rather than a
        separate story told in a different tool. Dates come from the tasks
        elements are already linked to, so a date moved in the Gantt is a date
        moved here — nothing to re-link and nothing to keep in step.
        """
        self.ensure_one()
        linked = self.env["construction.bim.element"].search([
            ("model_id", "=", self.id), ("task_id", "!=", False)])
        rows = []
        for element in linked:
            task = element.task_id
            start = task.date_assign or task.create_date
            finish = task.date_deadline or task.date_end
            if not start and not finish:
                continue
            rows.append({
                "global_id": element.global_id,
                "task": task.display_name,
                "start": str(fields.Date.to_date(start) or ""),
                "finish": str(fields.Date.to_date(finish) or
                              fields.Date.to_date(start) or ""),
            })
        return rows

    def _quantity_totals(self):
        """Model-wide totals, for the viewer's takeoff strip."""
        self.ensure_one()
        groups = self.env["construction.bim.element"]._read_group(
            [("model_id", "=", self.id), ("has_quantities", "=", True)],
            ["ifc_type"],
            ["__count", "quantity_volume:sum", "quantity_area:sum",
             "quantity_length:sum", "quantity_count:sum"],
        )
        return [
            {
                "ifc_type": ifc_type or "",
                "elements": count,
                "volume": volume or 0.0,
                "area": area or 0.0,
                "length": length or 0.0,
                "count": counted or 0.0,
            }
            for ifc_type, count, volume, area, length, counted in groups
        ]
