from werkzeug.exceptions import NotFound

from odoo import http
from odoo.http import request


class FacilityAssetTagController(http.Controller):
    def _asset(self, token):
        asset = request.env["maintenance.equipment"].search([
            ("tag_token", "=", token),
            ("tag_status", "=", "active"),
        ], limit=1)
        if not asset:
            raise NotFound()
        return asset

    def _backend_url(self, asset):
        facility_home = request.env.ref(
            "construction_ui.action_facility_home", raise_if_not_found=False)
        asset_workspace = request.env.ref(
            "construction_ui.action_workspace_assets", raise_if_not_found=False)
        if facility_home and asset_workspace:
            return (
                f"/odoo/action-{facility_home.id}/action-{asset_workspace.id}"
                f"/maintenance.equipment/{asset.id}"
            )
        action = request.env.ref("maintenance.hr_equipment_action")
        return f"/odoo/action-{action.id}/{asset.id}"

    @http.route(
        ["/majal/asset/<string:token>/<string:source>"],
        type="http", auth="user", website=True, methods=["GET"])
    def asset_landing(self, token, source="qr", **kwargs):
        if source not in {"qr", "nfc"}:
            raise NotFound()
        asset = self._asset(token)
        return request.render("facility_asset.asset_tag_landing", {
            "asset": asset,
            "source": source,
            "backend_url": self._backend_url(asset),
        })

    @http.route(
        ["/majal/asset/<string:token>/<string:source>/confirm"],
        type="http", auth="user", website=True, methods=["POST"], csrf=True)
    def asset_confirm(self, token, source="qr", **post):
        if source not in {"qr", "nfc"}:
            raise NotFound()
        asset = self._asset(token)
        asset.record_tag_scan(source)
        return request.redirect(self._backend_url(asset))
