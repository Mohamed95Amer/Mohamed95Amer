from odoo import _, fields, models
from odoo.exceptions import UserError


class MajalDocumentTemplate(models.Model):
    _inherit = "majal.document.template"

    source_file = fields.Binary(
        string="Source Document",
        attachment=True,
        help="Upload the customer's original fillable PDF. Majal keeps it as the visual template.",
    )
    source_filename = fields.Char(string="Source Filename")
    intake_upload_id = fields.Many2one(
        "majal.intake.upload", string="Field Mapping", readonly=True, copy=False,
    )
    mapped_form_template_id = fields.Many2one(
        "construction.form.template", string="Mapped Form", readonly=True, copy=False,
    )

    def action_map_source_document(self):
        self.ensure_one()
        if not self.source_file or not self.source_filename:
            raise UserError(_("Upload a fillable PDF before mapping its fields."))
        if not self.source_filename.lower().endswith(".pdf"):
            raise UserError(_("Field mapping from a template currently requires a PDF."))
        upload = self.intake_upload_id
        if not upload or upload.state in ("applied", "rejected"):
            upload = self.env["majal.intake.upload"].create({
                "file": self.source_file,
                "filename": self.source_filename,
                "company_id": self.company_id.id,
                "target_model": "construction.form.template",
                "document_template_id": self.id,
            })
            self.intake_upload_id = upload
        elif upload.state == "draft":
            upload.write({"file": self.source_file, "filename": self.source_filename})
        if upload.state == "draft":
            upload.action_parse()
        return {
            "type": "ir.actions.act_window",
            "name": _("Review Document Mapping"),
            "res_model": "majal.intake.upload",
            "res_id": upload.id,
            "view_mode": "form",
            "target": "current",
        }

    def action_open_mapped_form(self):
        self.ensure_one()
        if not self.mapped_form_template_id:
            raise UserError(_("No mapped form has been created yet."))
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.form.template",
            "res_id": self.mapped_form_template_id.id,
            "view_mode": "form",
        }
