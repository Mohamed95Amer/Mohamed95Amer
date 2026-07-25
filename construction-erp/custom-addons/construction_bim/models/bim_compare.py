"""What changed between two revisions of a model.

The question every design manager asks when a new IFC lands is "what moved?",
and the honest answer from most systems is "open both and look". GlobalId makes
a better answer possible: the same wall carries the same identity across
exports, so the two indexes can simply be differenced.

Deliberately not a geometric comparison. Two walls can have identical
quantities and sit a metre apart, and claiming to detect that from an index
would be a lie — what is claimed here is exactly what is checked: identity,
storey, name and measured quantity.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError

# Below this, a quantity difference is a rounding artefact of the exporter
# rather than a change anybody made.
QUANTITY_EPSILON = 0.001

CHANGE_TYPES = [
    ("added", "Added"),
    ("removed", "Removed"),
    ("moved", "Moved storey"),
    ("renamed", "Renamed"),
    ("quantity", "Quantity changed"),
]


class ConstructionBimComparison(models.TransientModel):
    """One run of a comparison between two revisions."""

    _name = "construction.bim.comparison"
    _description = "BIM Revision Comparison"

    # Not required: opening the dialog on a model that has no predecessor
    # would otherwise have to pre-select the model itself, which is a
    # comparison that can only be refused.
    base_model_id = fields.Many2one(
        "construction.bim.model", string="From Revision", ondelete="cascade")
    target_model_id = fields.Many2one(
        "construction.bim.model", string="To Revision", required=True,
        ondelete="cascade")
    line_ids = fields.One2many(
        "construction.bim.comparison.line", "comparison_id")
    added_count = fields.Integer(compute="_compute_counts")
    removed_count = fields.Integer(compute="_compute_counts")
    changed_count = fields.Integer(compute="_compute_counts")

    @api.depends("line_ids.change_type")
    def _compute_counts(self):
        for comparison in self:
            lines = comparison.line_ids
            comparison.added_count = len(
                lines.filtered(lambda l: l.change_type == "added"))
            comparison.removed_count = len(
                lines.filtered(lambda l: l.change_type == "removed"))
            comparison.changed_count = len(lines) - (
                comparison.added_count + comparison.removed_count)

    def action_compare(self):
        self.ensure_one()
        if not self.base_model_id:
            raise UserError(self.env._(
                "Choose the revision to compare against."))
        if self.base_model_id == self.target_model_id:
            raise UserError(self.env._("Choose two different revisions."))
        self.line_ids.unlink()
        self.env["construction.bim.comparison.line"].create(self._differences())
        return {
            "type": "ir.actions.act_window",
            "res_model": self._name,
            "res_id": self.id,
            "views": [[False, "form"]],
            "target": "new",
        }

    def _differences(self):
        """Every difference between the two indexes, as line values."""
        self.ensure_one()
        fields_read = [
            "global_id", "name", "ifc_type", "storey", "quantity_volume",
            "quantity_area", "quantity_length", "quantity_count", "is_linked",
        ]
        base = {
            row["global_id"]: row
            for row in self.env["construction.bim.element"].search_read(
                [("model_id", "=", self.base_model_id.id)], fields_read)
        }
        target = {
            row["global_id"]: row
            for row in self.env["construction.bim.element"].search_read(
                [("model_id", "=", self.target_model_id.id)], fields_read)
        }

        lines = []
        for global_id in target.keys() - base.keys():
            lines.append(self._line(global_id, target[global_id], "added"))
        for global_id in base.keys() - target.keys():
            # A removed element that carries records is the one that matters:
            # somebody raised an RFI against a wall the architect has deleted.
            lines.append(self._line(global_id, base[global_id], "removed"))

        for global_id in base.keys() & target.keys():
            before, after = base[global_id], target[global_id]
            if (before["storey"] or "") != (after["storey"] or ""):
                lines.append(self._line(
                    global_id, after, "moved",
                    was=before["storey"] or "—", now=after["storey"] or "—"))
            elif (before["name"] or "") != (after["name"] or ""):
                lines.append(self._line(
                    global_id, after, "renamed",
                    was=before["name"], now=after["name"]))
            else:
                changed = self._quantity_change(before, after)
                if changed:
                    measure, was, now = changed
                    lines.append(self._line(
                        global_id, after, "quantity",
                        was=f"{was:.3f}", now=f"{now:.3f}", measure=measure))
        return lines

    def _quantity_change(self, before, after):
        """The first quantity that actually moved, if any."""
        for measure in ("volume", "area", "length", "count"):
            field = f"quantity_{measure}"
            was, now = before.get(field) or 0.0, after.get(field) or 0.0
            if abs(now - was) > QUANTITY_EPSILON:
                return measure, was, now
        return None

    def _line(self, global_id, row, change_type, was="", now="", measure=""):
        return {
            "comparison_id": self.id,
            "global_id": global_id,
            "name": row.get("name") or global_id,
            "ifc_type": row.get("ifc_type") or "",
            "storey": row.get("storey") or "",
            "change_type": change_type,
            "was": was,
            "now": now,
            "measure": measure,
            "is_linked": row.get("is_linked", False),
        }


class ConstructionBimComparisonLine(models.TransientModel):
    _name = "construction.bim.comparison.line"
    _description = "BIM Revision Comparison Line"
    # Removals first: an element that has gone and carries an open RFI is the
    # one somebody has to deal with today.
    _order = "change_type, ifc_type, name"

    comparison_id = fields.Many2one(
        "construction.bim.comparison", required=True, ondelete="cascade")
    global_id = fields.Char(readonly=True)
    name = fields.Char(readonly=True)
    ifc_type = fields.Char(readonly=True)
    storey = fields.Char(readonly=True)
    change_type = fields.Selection(CHANGE_TYPES, readonly=True)
    measure = fields.Char(readonly=True)
    was = fields.Char(readonly=True)
    now = fields.Char(readonly=True)
    is_linked = fields.Boolean(
        readonly=True, string="Has Records",
        help="Carried an RFI, defect, task or bill item. A removal here needs "
             "somebody's attention.")
