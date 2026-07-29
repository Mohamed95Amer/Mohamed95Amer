from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    majal_trading_name = fields.Char(string="Trading Name")
    majal_registration_number = fields.Char(string="Registration Number")
    majal_tax_registration_number = fields.Char(string="Tax Registration Number")
    majal_license_number = fields.Char(string="Trade License Number")
    majal_document_email = fields.Char(string="Document Email")
    majal_document_phone = fields.Char(string="Document Phone")
    majal_document_website = fields.Char(string="Document Website")
    majal_document_address = fields.Text(string="Document Address")
    majal_authorized_signatory = fields.Char(string="Authorized Signatory")
    majal_authorized_signatory_title = fields.Char(string="Signatory Title")
    majal_approval_mark = fields.Binary(
        string="Internal Approval Mark",
        attachment=True,
        help=(
            "Optional company mark shown on internally approved documents. "
            "This is not a qualified electronic signature."
        ),
    )
    majal_document_footer = fields.Html(
        string="Document Footer",
        sanitize=True,
        translate=True,
    )
