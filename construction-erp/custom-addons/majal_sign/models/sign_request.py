import base64
import hashlib

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


SIGN_TRANSITION = object()


class MajalSignRequest(models.Model):
    _name = "majal.sign.request"
    _description = "Majal Signature Request"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc, id desc"

    document_id = fields.Many2one(
        "majal.document", required=True, ondelete="restrict", index=True,
        tracking=True,
    )
    version_id = fields.Many2one(
        "majal.document.version", required=True, ondelete="restrict",
        index=True, readonly=True,
    )
    company_id = fields.Many2one(
        related="document_id.company_id", store=True, readonly=True, index=True
    )
    signer_id = fields.Many2one(
        "res.users", required=True, tracking=True,
        domain="[('share', '=', False), ('company_ids', 'in', [company_id])]",
    )
    requested_by_id = fields.Many2one(
        "res.users", required=True, readonly=True,
        default=lambda self: self.env.user,
    )
    state = fields.Selection(
        [("pending", "Waiting for Signature"), ("signed", "Signed"),
         ("declined", "Declined"), ("cancelled", "Cancelled")],
        default="pending", required=True, readonly=True, tracking=True,
    )
    note = fields.Text(copy=False)
    signed_by_id = fields.Many2one("res.users", readonly=True, tracking=True)
    signed_on = fields.Datetime(readonly=True, tracking=True)
    signature = fields.Image(readonly=False, max_width=1024, max_height=512)
    signed_checksum = fields.Char(readonly=True, copy=False, index=True)

    _sql_constraints = [
        (
            "majal_sign_request_unique_pending",
            "unique(document_id, version_id, signer_id, state)",
            "A signer may have only one request in the same state for a revision.",
        )
    ]

    @api.model_create_multi
    def create(self, vals_list):
        documents = self.env["majal.document"]
        for values in vals_list:
            document = documents.browse(values.get("document_id")).exists()
            version = self.env["majal.document.version"].browse(
                values.get("version_id")
            ).exists()
            if not document or document.state not in ("approved", "issued"):
                raise ValidationError(
                    _("A signature can only be requested for an approved document.")
                )
            if not version or version.document_id != document:
                raise ValidationError(
                    _("The signature must reference a revision of this document.")
                )
            if version != document.current_version_id:
                raise ValidationError(
                    _("Only the current approved revision may be signed.")
                )
        return super().create(vals_list)

    def write(self, values):
        protected = {
            "state", "signed_by_id", "signed_on", "signed_checksum",
            "version_id", "document_id", "requested_by_id", "signer_id",
        }
        if protected.intersection(values) and not (
            self.env.su
            or self.env.context.get("majal_sign_transition") is SIGN_TRANSITION
        ):
            raise AccessError(_("Use the signing workflow to change this request."))
        if "signature" in values and any(record.state == "signed" for record in self):
            raise UserError(_("A signed request cannot be edited."))
        if "signature" in values and any(
            record.signer_id != self.env.user for record in self
        ) and not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError(_("Only the named signer may provide a signature."))
        return super().write(values)

    def unlink(self):
        if not self.env.su and any(record.state == "signed" for record in self):
            raise UserError(_("Signed requests are immutable and cannot be deleted."))
        return super().unlink()

    def _can_sign(self):
        self.ensure_one()
        if self.signer_id != self.env.user and not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError(_("Only the named signer may sign this request."))
        if self.state != "pending":
            raise UserError(_("This signature request is no longer pending."))
        if self.version_id != self.document_id.current_version_id:
            raise ValidationError(_("The document revision has changed."))

    def action_sign(self):
        for request in self:
            request._can_sign()
            if not request.signature:
                raise ValidationError(_("Add a signature before confirming."))
            digest = hashlib.sha256()
            digest.update((request.version_id.checksum or "").encode())
            digest.update(str(request.signer_id.id).encode())
            digest.update(base64.b64decode(request.signature))
            request.with_context(majal_sign_transition=SIGN_TRANSITION).write({
                "state": "signed",
                "signed_by_id": self.env.user.id,
                "signed_on": fields.Datetime.now(),
                "signed_checksum": digest.hexdigest(),
            })
            request.message_post(
                body=_("Signed revision R%02d. Evidence checksum: %s")
                % (request.version_id.revision, request.signed_checksum[:12])
            )
        return True

    def action_decline(self):
        for request in self:
            request._can_sign()
            if not request.note:
                raise ValidationError(_("Add a note explaining the decline."))
            request.with_context(majal_sign_transition=SIGN_TRANSITION).write(
                {"state": "declined"}
            )
        return True

    def action_cancel(self):
        for request in self:
            if request.requested_by_id != self.env.user and not self.env.user.has_group(
                "majal_administration.group_platform_owner"
            ):
                raise AccessError(_("Only the requester or a Platform Owner may cancel."))
            if request.state != "pending":
                raise UserError(_("Only pending requests can be cancelled."))
            request.with_context(majal_sign_transition=SIGN_TRANSITION).write(
                {"state": "cancelled"}
            )
        return True
