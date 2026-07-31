import html
import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


PLACEHOLDER = re.compile(r"\{\{\s*([a-z0-9_.]+)\s*\}\}", re.IGNORECASE)
ALLOWED_PLACEHOLDERS = {
    "company.name",
    "company.trading_name",
    "company.registration_number",
    "company.tax_number",
    "company.address",
    "company.phone",
    "company.email",
    "project.name",
    "document.reference",
    "document.name",
    "document.date",
    "recipient.name",
    "recipient.email",
}


class MajalDocumentTemplate(models.Model):
    _name = "majal.document.template"
    _description = "Majal Document Template"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "document_type, name"

    name = fields.Char(required=True, tracking=True, translate=True)
    code = fields.Char(required=True, copy=False, index=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    language = fields.Selection(
        [("en_US", "English"), ("ar_001", "Arabic")],
        default="en_US",
        required=True,
    )
    document_type = fields.Selection(
        [
            ("letter", "Letter"),
            ("contract", "Contract"),
            ("quotation", "Quotation"),
            ("submittal", "Submittal"),
            ("rfi", "RFI"),
            ("inspection", "Inspection"),
            ("handover", "Handover"),
            ("other", "Other"),
        ],
        required=True,
        default="letter",
    )
    body_html = fields.Html(
        required=True,
        sanitize=True,
        translate=True,
        help=(
            "Use approved placeholders such as {{ company.name }}, "
            "{{ project.name }} and {{ document.reference }}."
        ),
    )
    placeholder_help = fields.Text(
        compute="_compute_placeholder_help",
        string="Available Placeholders",
    )

    _sql_constraints = [
        (
            "majal_document_template_code_company_unique",
            "unique(code, company_id)",
            "Template codes must be unique per company.",
        )
    ]

    @api.depends("language")
    def _compute_placeholder_help(self):
        value = "\n".join("{{ %s }}" % item for item in sorted(ALLOWED_PLACEHOLDERS))
        for record in self:
            record.placeholder_help = value

    @api.constrains("body_html")
    def _check_placeholders(self):
        for record in self:
            unknown = set(PLACEHOLDER.findall(record.body_html or "")) - ALLOWED_PLACEHOLDERS
            if unknown:
                raise ValidationError(
                    _("Unsupported template placeholders: %s")
                    % ", ".join(sorted(unknown))
                )

    def render_for_document(self, document):
        self.ensure_one()
        document.ensure_one()
        company = document.company_id
        project = document.project_id
        recipient = document.recipient_id
        values = {
            "company.name": company.name or "",
            "company.trading_name": company.majal_trading_name or "",
            "company.registration_number": company.majal_registration_number or "",
            "company.tax_number": company.majal_tax_registration_number or "",
            "company.address": company.majal_document_address or "",
            "company.phone": company.majal_document_phone or "",
            "company.email": company.majal_document_email or "",
            "project.name": project.name or "",
            "document.reference": document.reference or "",
            "document.name": document.name or "",
            "document.date": fields.Date.to_string(document.document_date),
            "recipient.name": recipient.name or "",
            "recipient.email": recipient.email or "",
        }
        return PLACEHOLDER.sub(
            lambda match: html.escape(values.get(match.group(1), "")),
            self.body_html or "",
        )
