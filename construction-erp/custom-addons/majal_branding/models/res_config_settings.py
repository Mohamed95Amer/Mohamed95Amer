import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError


HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    majal_product_name = fields.Char(
        string="Product name",
        config_parameter="majal.product_name",
        default="Majal",
    )
    majal_tagline = fields.Char(
        string="Tagline",
        config_parameter="majal.tagline",
        default="Construction & Facilities",
    )
    majal_support_email = fields.Char(
        string="Support email",
        config_parameter="majal.support_email",
    )
    majal_support_url = fields.Char(
        string="Support URL",
        config_parameter="majal.support_url",
    )
    majal_privacy_url = fields.Char(
        string="Privacy URL",
        config_parameter="majal.privacy_url",
    )
    majal_terms_url = fields.Char(
        string="Terms URL",
        config_parameter="majal.terms_url",
    )
    majal_nav_color = fields.Char(
        string="Navigation colour",
        config_parameter="majal.nav_color",
        default="#173240",
    )
    majal_primary_color = fields.Char(
        string="Primary colour",
        config_parameter="majal.primary_color",
        default="#346D75",
    )
    majal_accent_color = fields.Char(
        string="Accent colour",
        config_parameter="majal.accent_color",
        default="#C59B52",
    )

    @api.constrains(
        "majal_nav_color",
        "majal_primary_color",
        "majal_accent_color",
    )
    def _check_majal_colours(self):
        for record in self:
            for field_name in (
                "majal_nav_color",
                "majal_primary_color",
                "majal_accent_color",
            ):
                value = record[field_name]
                if value and not HEX_COLOR.fullmatch(value):
                    raise ValidationError(
                        "Majal colours must use the format #RRGGBB."
                    )

    @api.model
    def _get_majal_brand_colours(self):
        params = self.env["ir.config_parameter"].sudo()

        def safe_value(key, default):
            value = params.get_param(key, default)
            return value if HEX_COLOR.fullmatch(value or "") else default

        return {
            "nav": safe_value("majal.nav_color", "#173240"),
            "primary": safe_value("majal.primary_color", "#346D75"),
            "accent": safe_value("majal.accent_color", "#C59B52"),
        }
