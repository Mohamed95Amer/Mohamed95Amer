"""Give the client back their own form, filled.

A Majal report containing the same answers is not the same artifact. An H&S
auditor, a principal contractor or a landlord asks for the permit, the method
statement, the handover certificate — on the form they issued. So when an
inspection was built from a PDF, completing it produces that PDF with the
boxes filled, not a substitute.

The link between a question and a box is construction.form.question.
instructions, which intake fills with the PDF's own field name. That is why
questions added by hand afterwards are skipped rather than guessed at: a
question with no field name has no box, and writing it into the wrong one
would be worse than leaving it out.
"""

import base64

from odoo import _, api, fields, models
from odoo.exceptions import UserError

from .parsers import ParseError, fill_pdf_form


class ConstructionFormTemplate(models.Model):
    _inherit = "construction.form.template"

    source_pdf_id = fields.Many2one(
        "ir.attachment",
        compute="_compute_source_pdf",
        help="The PDF this form was built from, if it was built from one.",
    )
    has_source_pdf = fields.Boolean(compute="_compute_source_pdf")

    @api.model
    def _intake_writable_fields(self):
        """Which answer types an import may set on a question.

        This is the same contract majal.document and majal.sheet implement,
        and the intake screen calls it on whichever model an upload targets.
        Without it here, the question "what may an import write?" had no
        answer for a PDF form, and the review line's onchange — the code path
        behind correcting a mis-detected answer type — raised AttributeError.

        For a form the writable positions are not field names but the values
        of construction.form.question.answer_type, so the set is read off that
        Selection rather than restated, which would drift.
        """
        question = self.env["construction.form.question"]
        return {value for value, _label in question._fields["answer_type"].selection}

    def _compute_source_pdf(self):
        attachments = self.env["ir.attachment"].search([
            ("res_model", "=", self._name),
            ("res_id", "in", self.ids),
            ("mimetype", "=", "application/pdf"),
        ])
        by_template = {}
        for attachment in attachments:
            by_template.setdefault(attachment.res_id, attachment)
        for template in self:
            found = by_template.get(template.id)
            template.source_pdf_id = found
            template.has_source_pdf = bool(found)


class ConstructionFormInspection(models.Model):
    _inherit = "construction.form.inspection"

    has_source_pdf = fields.Boolean(related="template_id.has_source_pdf")

    def _pdf_values(self):
        """{pdf field name: text} for the answers that map to a box."""
        self.ensure_one()
        values = {}
        for answer in self.answer_ids:
            field_name = (answer.question_id.instructions or "").strip()
            if not field_name:
                continue
            answer_type = answer.answer_type
            if answer_type == "yes_no":
                # A PDF checkbox is on or off. "N/A" is neither, and writing
                # "Off" for it would read as an explicit No.
                if not answer.answer_yes_no or answer.answer_yes_no == "na":
                    continue
                value = "Yes" if answer.answer_yes_no == "yes" else "Off"
            elif answer_type == "number":
                value = "" if answer.answer_number is None else str(answer.answer_number)
            elif answer_type == "date":
                value = fields.Date.to_string(answer.answer_date) if answer.answer_date else ""
            elif answer_type in ("photo", "signature"):
                # Images cannot be written into a text box. The answer is kept
                # as an attachment on the inspection; claiming otherwise by
                # stamping a filename into the form would be worse than a gap.
                continue
            else:
                value = answer.answer_text or ""
            if value:
                values[field_name] = value
        return values

    def action_export_filled_pdf(self):
        self.ensure_one()
        source = self.template_id.source_pdf_id
        if not source:
            raise UserError(_(
                "This form was not built from a PDF, so there is no original "
                "to fill. Use the standard inspection report instead."
            ))

        values = self._pdf_values()
        if not values:
            raise UserError(_("No answer maps to a field in the source PDF."))

        try:
            filled = fill_pdf_form(base64.b64decode(source.datas), values)
        except ParseError as error:
            raise UserError(str(error))

        attachment = self.env["ir.attachment"].create({
            "name": f"{self.name or 'inspection'}-{source.name}",
            "datas": base64.b64encode(filled),
            "res_model": self._name,
            "res_id": self.id,
        })
        self._message_log(
            body=_("Filled copy of %s produced.", source.name),
            attachment_ids=attachment.ids,
        )
        return {
            "type": "ir.actions.act_url",
            "url": f"/web/content/{attachment.id}?download=true",
            "target": "self",
        }
