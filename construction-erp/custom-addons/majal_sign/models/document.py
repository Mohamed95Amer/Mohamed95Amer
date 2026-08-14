from odoo import _, fields, models
from odoo.exceptions import UserError


class MajalDocument(models.Model):
    _inherit = "majal.document"

    sign_request_ids = fields.One2many(
        "majal.sign.request", "document_id", readonly=True
    )
    sign_request_count = fields.Integer(
        compute="_compute_sign_request_count"
    )

    def _compute_sign_request_count(self):
        grouped = self.env["majal.sign.request"].read_group(
            [("document_id", "in", self.ids)], ["document_id"], ["document_id"]
        )
        counts = {
            row["document_id"][0]: row["document_id_count"] for row in grouped
        }
        for document in self:
            document.sign_request_count = counts.get(document.id, 0)

    def action_request_signature(self):
        self.ensure_one()
        if self.state not in ("approved", "issued"):
            raise UserError(
                _("Only approved or issued documents can be sent for signature.")
            )
        if not self.current_version_id:
            raise UserError(_("A current revision is required first."))
        return {
            "type": "ir.actions.act_window",
            "name": _("Request Majal Signature"),
            "res_model": "majal.sign.request",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_document_id": self.id,
                "default_version_id": self.current_version_id.id,
            },
        }

    def action_view_sign_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Signature Requests — %s") % self.reference,
            "res_model": "majal.sign.request",
            "view_mode": "list,form",
            "domain": [("document_id", "=", self.id)],
            "context": {"default_document_id": self.id},
        }
