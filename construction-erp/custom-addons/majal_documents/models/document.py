import base64
import hashlib

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

from .transitions import DOCUMENT_TRANSITION


DOCUMENT_STATES = [
    ("draft", "Draft"),
    ("submitted", "Awaiting Approval"),
    ("approved", "Approved"),
    ("issued", "Issued"),
    ("rejected", "Rejected"),
    ("cancelled", "Cancelled"),
]


class MajalDocument(models.Model):
    _name = "majal.document"
    _description = "Majal Controlled Document"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "document_date desc, id desc"

    reference = fields.Char(
        required=True,
        copy=False,
        default=lambda self: _("New"),
        tracking=True,
        index=True,
    )
    name = fields.Char(required=True, tracking=True, translate=True)
    document_date = fields.Date(
        required=True,
        default=fields.Date.context_today,
        tracking=True,
    )
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    project_id = fields.Many2one(
        "project.project",
        domain="[('company_id', '=', company_id)]",
        tracking=True,
        index=True,
    )
    recipient_id = fields.Many2one("res.partner", tracking=True)
    template_id = fields.Many2one(
        "majal.document.template",
        domain="[('company_id', '=', company_id)]",
    )
    document_type = fields.Selection(
        related="template_id.document_type",
        store=True,
        readonly=True,
    )
    language = fields.Selection(
        [("en_US", "English"), ("ar_001", "Arabic")],
        default="en_US",
        required=True,
    )
    body_html = fields.Html(
        required=True,
        default="<p></p>",
        sanitize=True,
        translate=True,
    )
    state = fields.Selection(
        DOCUMENT_STATES,
        default="draft",
        required=True,
        readonly=True,
        tracking=True,
        index=True,
    )
    approver_id = fields.Many2one(
        "res.users",
        string="Required Approver",
        domain="[('share', '=', False), ('company_ids', 'in', [company_id])]",
        tracking=True,
    )
    submitted_by_id = fields.Many2one("res.users", readonly=True)
    submitted_at = fields.Datetime(readonly=True)
    approved_by_id = fields.Many2one("res.users", readonly=True)
    approved_at = fields.Datetime(readonly=True)
    approval_checksum = fields.Char(readonly=True, copy=False)
    approval_note = fields.Text(copy=False)
    issued_by_id = fields.Many2one("res.users", readonly=True)
    issued_at = fields.Datetime(readonly=True)
    current_version_id = fields.Many2one(
        "majal.document.version",
        readonly=True,
        copy=False,
        ondelete="restrict",
    )
    version_ids = fields.One2many(
        "majal.document.version",
        "document_id",
        readonly=True,
    )
    version_count = fields.Integer(compute="_compute_version_count")
    current_revision = fields.Integer(
        related="current_version_id.revision",
        readonly=True,
    )
    current_checksum = fields.Char(
        related="current_version_id.checksum",
        readonly=True,
    )
    requires_qualified_signature = fields.Boolean(
        help=(
            "Flags documents that must use an approved external trust-service "
            "provider. Majal's internal approval is not a qualified signature."
        )
    )

    _sql_constraints = [
        (
            "majal_document_reference_company_unique",
            "unique(reference, company_id)",
            "Document references must be unique per company.",
        )
    ]

    @api.depends("version_ids")
    def _compute_version_count(self):
        grouped = self.env["majal.document.version"].read_group(
            [("document_id", "in", self.ids)],
            ["document_id"],
            ["document_id"],
        )
        counts = {
            row["document_id"][0]: row["document_id_count"] for row in grouped
        }
        for record in self:
            record.version_count = counts.get(record.id, 0)

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"]
        for values in vals_list:
            if values.get("reference", _("New")) == _("New"):
                values["reference"] = (
                    sequence.next_by_code("majal.document") or _("New")
                )
        return super().create(vals_list)

    def write(self, values):
        transition_fields = {
            "state",
            "submitted_by_id",
            "submitted_at",
            "approved_by_id",
            "approved_at",
            "approval_checksum",
            "issued_by_id",
            "issued_at",
            "current_version_id",
        }
        if transition_fields.intersection(values) and not (
            self.env.su
            or self.env.context.get("majal_document_transition")
            is DOCUMENT_TRANSITION
        ):
            raise AccessError(_("Use the document workflow buttons to change status."))
        controlled_content = {
            "name",
            "document_date",
            "company_id",
            "project_id",
            "recipient_id",
            "template_id",
            "language",
            "body_html",
            "requires_qualified_signature",
        }
        if controlled_content.intersection(values):
            locked = self.filtered(
                lambda record: record.state not in ("draft", "rejected")
            )
            if locked and not self.env.su:
                raise UserError(
                    _("Approved content cannot be edited. Reset it to draft first.")
                )
        return super().write(values)

    def unlink(self):
        if not self.env.su and any(
            record.state not in ("draft", "rejected", "cancelled")
            for record in self
        ):
            raise UserError(_("Submitted or issued documents cannot be deleted."))
        return super().unlink()

    def action_apply_template(self):
        for record in self:
            if record.state not in ("draft", "rejected"):
                raise UserError(_("Only editable documents can apply a template."))
            if not record.template_id:
                raise ValidationError(_("Select a template first."))
            record.body_html = record.template_id.render_for_document(record)
        return True

    def _create_version(self):
        self.ensure_one()
        content = (self.body_html or "").encode("utf-8")
        checksum = hashlib.sha256(content).hexdigest()
        last_revision = max(self.version_ids.mapped("revision"), default=0)
        filename = "%s-R%02d.html" % (self.reference, last_revision + 1)
        attachment = self.env["ir.attachment"].sudo().create(
            {
                "name": filename,
                "type": "binary",
                "datas": base64.b64encode(content),
                "mimetype": "text/html",
                "res_model": "majal.document",
                "res_id": self.id,
                "company_id": self.company_id.id,
            }
        )
        version = self.env["majal.document.version"].sudo().create(
            {
                "document_id": self.id,
                "revision": last_revision + 1,
                "body_html": self.body_html,
                "checksum": checksum,
                "attachment_id": attachment.id,
                "created_by_id": self.env.user.id,
            }
        )
        self.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
            {"current_version_id": version.id}
        )
        return version

    def action_submit(self):
        for record in self:
            if record.state not in ("draft", "rejected"):
                raise UserError(_("Only draft or rejected documents can be submitted."))
            if not record.approver_id:
                raise ValidationError(_("Choose a required approver."))
            if record.approver_id == self.env.user:
                raise ValidationError(
                    _("The submitter and required approver must be different users.")
                )
            version = record._create_version()
            record.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
                {
                    "state": "submitted",
                    "submitted_by_id": self.env.user.id,
                    "submitted_at": fields.Datetime.now(),
                    "approved_by_id": False,
                    "approved_at": False,
                    "approval_checksum": False,
                }
            )
            record.message_post(
                body=_("Revision R%02d was submitted for approval.") % version.revision
            )
        return True

    def _check_named_approver(self):
        self.ensure_one()
        is_platform_owner = self.env.user.has_group(
            "majal_administration.group_platform_owner"
        )
        if self.approver_id != self.env.user and not is_platform_owner:
            raise AccessError(_("Only the named approver or a Platform Owner may act."))
        if self.submitted_by_id == self.env.user:
            raise AccessError(_("A submitter cannot approve their own document."))

    def action_approve(self):
        for record in self:
            if record.state != "submitted":
                raise UserError(_("Only submitted documents can be approved."))
            record._check_named_approver()
            if not record.current_version_id:
                raise ValidationError(_("The submitted version is missing."))
            record.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
                {
                    "state": "approved",
                    "approved_by_id": self.env.user.id,
                    "approved_at": fields.Datetime.now(),
                    "approval_checksum": record.current_version_id.checksum,
                }
            )
            record.message_post(
                body=_("Approved exact revision R%02d (%s).")
                % (
                    record.current_version_id.revision,
                    record.current_version_id.checksum[:12],
                )
            )
        return True

    def action_reject(self):
        for record in self:
            if record.state != "submitted":
                raise UserError(_("Only submitted documents can be rejected."))
            record._check_named_approver()
            record.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
                {"state": "rejected"}
            )
        return True

    def action_issue(self):
        for record in self:
            if record.state != "approved":
                raise UserError(_("Approve the document before issuing it."))
            if record.approval_checksum != record.current_version_id.checksum:
                raise ValidationError(
                    _("The approved checksum no longer matches the current revision.")
                )
            record.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
                {
                    "state": "issued",
                    "issued_by_id": self.env.user.id,
                    "issued_at": fields.Datetime.now(),
                }
            )
        return True

    def action_reset_to_draft(self):
        for record in self:
            role_rank = self.env.user.majal_role_id.rank or 0
            if role_rank < 30:
                raise AccessError(_("A manager must reopen a controlled document."))
            if record.state not in ("rejected", "cancelled", "approved"):
                raise UserError(_("This document cannot be reset to draft."))
            record.with_context(majal_document_transition=DOCUMENT_TRANSITION).write(
                {
                    "state": "draft",
                    "approved_by_id": False,
                    "approved_at": False,
                    "approval_checksum": False,
                }
            )
        return True

    def action_print(self):
        self.ensure_one()
        return self.env.ref("majal_documents.action_report_majal_document").report_action(
            self
        )

    def action_view_versions(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Revisions — %s") % self.reference,
            "res_model": "majal.document.version",
            "view_mode": "list,form",
            "domain": [("document_id", "=", self.id)],
            "context": {"create": False, "delete": False},
        }


class MajalDocumentVersion(models.Model):
    _name = "majal.document.version"
    _description = "Immutable Majal Document Version"
    _order = "document_id, revision desc"

    document_id = fields.Many2one(
        "majal.document",
        required=True,
        ondelete="restrict",
        index=True,
        readonly=True,
    )
    company_id = fields.Many2one(
        related="document_id.company_id",
        store=True,
        index=True,
        readonly=True,
    )
    revision = fields.Integer(required=True, readonly=True)
    body_html = fields.Html(required=True, sanitize=True, readonly=True)
    checksum = fields.Char(required=True, readonly=True, index=True)
    attachment_id = fields.Many2one(
        "ir.attachment",
        required=True,
        ondelete="restrict",
        readonly=True,
    )
    created_by_id = fields.Many2one("res.users", required=True, readonly=True)
    create_date = fields.Datetime(readonly=True)

    _sql_constraints = [
        (
            "majal_document_revision_unique",
            "unique(document_id, revision)",
            "A revision number may only be used once per document.",
        )
    ]

    def write(self, _values):
        if not self.env.su:
            raise AccessError(_("Document versions are immutable."))
        return super().write(_values)

    def unlink(self):
        if not self.env.su:
            raise AccessError(_("Document versions cannot be deleted."))
        return super().unlink()
