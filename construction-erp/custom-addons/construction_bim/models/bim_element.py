from odoo import api, fields, models

# Buckets drive the colour a linked element is drawn in. Deliberately coarse:
# a model with a thousand shades tells you nothing from across the room.
BUCKET_ORDER = ("blocked", "open", "done", "none")


class ConstructionBimElement(models.Model):
    """One identified element inside a model, and what it is linked to.

    The link is by GlobalId, not by position. A pin on a drawing sheet is a
    coordinate — move the drawing and the pin is meaningless — but an IFC
    element carries an identity the authoring tool promises to preserve across
    exports. That difference is why this does not reuse the 2D pin mixin: the
    question "which wall is this?" has an answer here that survives the model
    being redrawn.
    """

    _name = "construction.bim.element"
    _description = "BIM Element"
    _order = "storey, ifc_type, name"

    model_id = fields.Many2one(
        "construction.bim.model", required=True, ondelete="cascade", index=True)
    project_id = fields.Many2one(
        related="model_id.project_id", store=True, index=True)
    global_id = fields.Char(required=True, index=True, readonly=True)
    step_id = fields.Integer(readonly=True)
    ifc_type = fields.Char(readonly=True, index=True)
    name = fields.Char()
    storey = fields.Char(index=True)
    is_orphan = fields.Boolean(
        readonly=True,
        help="No longer present in the latest indexed file, but kept because "
             "records are attached to it.",
    )

    task_id = fields.Many2one("project.task", ondelete="set null")
    rfi_id = fields.Many2one("construction.rfi", ondelete="set null")
    defect_id = fields.Many2one("construction.defect", ondelete="set null")
    boq_line_id = fields.Many2one("construction.boq.line", ondelete="set null")
    note = fields.Text()

    is_linked = fields.Boolean(compute="_compute_links", store=True)
    link_summary = fields.Char(compute="_compute_links", store=True)
    link_bucket = fields.Selection(
        [("blocked", "Blocked"), ("open", "Open"), ("done", "Done"),
         ("none", "Nothing linked")],
        compute="_compute_links", store=True, default="none",
    )

    _sql_constraints = [
        ("global_id_per_model", "unique(model_id, global_id)",
         "An element appears once per model."),
    ]

    @api.depends(
        "task_id", "task_id.state", "rfi_id", "rfi_id.state",
        "defect_id", "defect_id.state", "boq_line_id", "note",
    )
    def _compute_links(self):
        for element in self:
            parts, buckets = [], []
            if element.rfi_id:
                parts.append(element.rfi_id.display_name)
                buckets.append(
                    "done" if element.rfi_id.state in ("closed", "cancelled")
                    else "blocked")
            if element.defect_id:
                parts.append(element.defect_id.display_name)
                buckets.append(
                    "done" if element.defect_id.state in ("closed", "cancelled")
                    else "open")
            if element.task_id:
                parts.append(element.task_id.display_name)
                buckets.append(
                    "done" if element.task_id.state in ("1_done", "1_canceled")
                    else "open")
            if element.boq_line_id:
                parts.append(element.boq_line_id.display_name)
            if element.note and not parts:
                parts.append(element.note[:60])

            element.is_linked = bool(
                element.rfi_id or element.defect_id or element.task_id
                or element.boq_line_id or element.note)
            element.link_summary = " · ".join(parts)
            # Worst state wins: an element with a closed defect and an open RFI
            # is not resolved, and drawing it green would say that it is.
            element.link_bucket = next(
                (b for b in BUCKET_ORDER if b in buckets),
                "open" if element.is_linked else "none",
            )

    def action_open_link(self):
        """Open whatever this element is attached to."""
        self.ensure_one()
        for field, model in (("rfi_id", "construction.rfi"),
                             ("defect_id", "construction.defect"),
                             ("task_id", "project.task"),
                             ("boq_line_id", "construction.boq.line")):
            record = self[field]
            if record:
                return {
                    "type": "ir.actions.act_window",
                    "res_model": model,
                    "res_id": record.id,
                    "view_mode": "form",
                }
        return False

    @api.model
    def link_element(self, model_id, global_id, values):
        """Attach a record to an element, creating the element if needed.

        Called from the viewer, where the user has just clicked something in
        the 3D model that the index may not have seen — a nested component of
        an assembly, for instance. Creating it on demand means the viewer never
        has to say "you cannot link that".
        """
        element = self.search([
            ("model_id", "=", model_id), ("global_id", "=", global_id)], limit=1)
        if not element:
            element = self.create({
                "model_id": model_id,
                "global_id": global_id,
                "name": values.get("name") or global_id,
                "ifc_type": values.get("ifc_type") or "",
            })
        writable = {
            key: values[key] for key in
            ("task_id", "rfi_id", "defect_id", "boq_line_id", "note", "name")
            if key in values
        }
        if writable:
            element.write(writable)
        return element.id
