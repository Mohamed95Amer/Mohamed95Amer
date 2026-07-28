import re

from odoo.http import request
from odoo.addons.web.controllers import webmanifest


HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


class MajalWebManifest(webmanifest.WebManifest):
    def _parameter(self, key, default):
        return request.env["ir.config_parameter"].sudo().get_param(key, default)

    def _colour(self, key, default):
        value = self._parameter(key, default)
        return value if HEX_COLOR.fullmatch(value or "") else default

    def _get_shortcuts(self):
        return [
            {
                "name": "Majal Construction",
                "short_name": "Construction",
                "url": "/odoo/action-construction_ui.action_construction_home",
                "description": "Projects, site operations and commercial control",
                "icons": [{
                    "sizes": "any",
                    "src": "/construction_ui/static/description/apps/construction.svg",
                    "type": "image/svg+xml",
                }],
            },
            {
                "name": "Majal Facilities",
                "short_name": "Facilities",
                "url": "/odoo/action-construction_ui.action_facility_home",
                "description": "Assets, work orders and preventive maintenance",
                "icons": [{
                    "sizes": "any",
                    "src": "/construction_ui/static/description/apps/facilities.svg",
                    "type": "image/svg+xml",
                }],
            },
        ]

    def _get_webmanifest(self):
        manifest = super()._get_webmanifest()
        product_name = self._parameter("majal.product_name", "Majal")
        manifest.update({
            "name": f"{product_name} — Construction & Facilities",
            "short_name": product_name,
            "description": "Smart construction and facilities operations",
            "start_url": "/odoo/action-construction_ui.action_construction_home",
            "background_color": "#F4F6F7",
            "theme_color": self._colour("majal.nav_color", "#173240"),
            "icons": [
                {
                    "src": "/majal_branding/static/description/icon.svg",
                    "sizes": "any",
                    "type": "image/svg+xml",
                    "purpose": "any maskable",
                },
            ],
            "shortcuts": self._get_shortcuts(),
        })
        return manifest

    def _icon_path(self):
        return "majal_branding/static/src/img/majal-assistant.png"

    def _get_scoped_app_icons(self, app_id):
        return [{
            "src": "/majal_branding/static/description/icon.svg",
            "sizes": "any",
            "type": "image/svg+xml",
            "purpose": "any maskable",
        }]

    def _get_scoped_app_name(self, app_id):
        return self._parameter("majal.product_name", "Majal")
