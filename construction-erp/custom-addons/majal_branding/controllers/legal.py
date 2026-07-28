from odoo import http
from odoo.http import request


class MajalLegal(http.Controller):
    def _brand_values(self):
        params = request.env["ir.config_parameter"].sudo()
        return {
            "product_name": params.get_param("majal.product_name", "Majal"),
            "support_email": params.get_param("majal.support_email", ""),
            "support_url": params.get_param("majal.support_url", ""),
            "privacy_url": params.get_param("majal.privacy_url", ""),
            "terms_url": params.get_param("majal.terms_url", ""),
        }

    @http.route(
        "/majal/legal/open-source",
        type="http",
        auth="public",
        methods=["GET"],
        readonly=True,
        sitemap=False,
        website=True,
    )
    def open_source_notices(self, **kwargs):
        return request.render(
            "majal_branding.open_source_notices",
            self._brand_values(),
        )

    @http.route(
        "/majal/help",
        type="http",
        auth="public",
        methods=["GET"],
        readonly=True,
        sitemap=False,
        website=True,
    )
    def help_and_support(self, **kwargs):
        return request.render(
            "majal_branding.help_and_support",
            self._brand_values(),
        )
