from odoo import api, fields, models


class ConstructionDocumentMixin(models.AbstractModel):
    """Common behaviour for numbered project documents (RFI, submittal,
    change order, claim...): per-project sequential reference, ball-in-court
    responsibility and overdue tracking."""

    _name = "construction.document.mixin"
    _description = "Construction Document Mixin"

    # Subclasses set this to the document prefix, e.g. "RFI" -> PRJ-RFI-0001.
    _doc_prefix = "DOC"

    name = fields.Char(required=True)
    reference = fields.Char(copy=False, readonly=True)
    project_id = fields.Many2one(
        "project.project",
        required=True,
        ondelete="restrict",
        domain=[("is_construction", "=", True)],
        index=True,
    )
    company_id = fields.Many2one(
        "res.company", related="project_id.company_id", store=True
    )
    ball_in_court_id = fields.Many2one(
        "res.partner",
        string="Ball in Court",
        help="Party currently responsible for the next action.",
        tracking=True,
    )
    date_required = fields.Date(
        help="Date by which a response/action is required."
    )
    is_overdue = fields.Boolean(compute="_compute_is_overdue", search="_search_is_overdue")

    def _is_open_for_overdue(self):
        """Subclasses override to exclude terminal states from overdue flagging."""
        self.ensure_one()
        return True

    @api.depends("date_required")
    def _compute_is_overdue(self):
        today = fields.Date.context_today(self)
        for rec in self:
            rec.is_overdue = bool(
                rec.date_required
                and rec.date_required < today
                and rec._is_open_for_overdue()
            )

    def _search_is_overdue(self, operator, value):
        today = fields.Date.context_today(self)
        domain = [("date_required", "<", today)]
        if (operator == "=" and value) or (operator == "!=" and not value):
            return domain
        return ["!"] + domain

    def _next_reference(self, project):
        """PRJ-RFI-0001: the project, the document type, the number.

        The middle part is whatever the company configured under Settings →
        Document Numbering, falling back to `_doc_prefix` where nothing is
        configured — which is every install until somebody changes it, so the
        fallback is the normal path and not an error case.

        The counter is keyed on `_doc_prefix` rather than on the configured
        prefix, deliberately. See construction_base/models/document_code.py:
        keying it on the visible prefix would restart every register at 1 the
        first time somebody edited one.
        """
        seq = self.env["ir.sequence"]._construction_document_sequence(
            self._doc_prefix, project.company_id)
        number = seq.next_by_id()
        configured = self.env["construction.document.code"]._for(
            self._name, project.company_id)
        prefix = configured.prefix or self._doc_prefix
        code = project.project_code or f"P{project.id}"
        return f"{code}-{prefix}-{number}"

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for rec in records:
            if not rec.reference and rec.project_id:
                rec.reference = rec._next_reference(rec.project_id)
        return records
