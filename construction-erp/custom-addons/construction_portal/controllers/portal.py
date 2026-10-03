from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request
from odoo.addons.portal.controllers.portal import CustomerPortal, pager


class ConstructionPortal(CustomerPortal):

    # ------------------------------------------------------------------
    # Home counters
    # ------------------------------------------------------------------
    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if "rfi_count" in counters:
            values["rfi_count"] = request.env["construction.rfi"].search_count([])
        if "defect_count" in counters:
            values["defect_count"] = request.env[
                "construction.defect"].search_count([])
        if "subcontract_count" in counters:
            values["subcontract_count"] = request.env[
                "construction.subcontract"].search_count([])
        return values

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _construction_list(self, model, route, page, searchbar_sortings=None):
        Model = request.env[model]
        total = Model.search_count([])
        page_detail = pager(
            url=route, total=total, page=page, step=self._items_per_page)
        records = Model.search(
            [], limit=self._items_per_page, offset=page_detail["offset"],
            order="id desc")
        return page_detail, records.sudo()

    # ------------------------------------------------------------------
    # RFIs
    # ------------------------------------------------------------------
    @http.route(["/my/rfis", "/my/rfis/page/<int:page>"], type="http",
                auth="user", website=True)
    def portal_my_rfis(self, page=1, **kw):
        page_detail, rfis = self._construction_list(
            "construction.rfi", "/my/rfis", page)
        values = {
            "rfis": rfis,
            "pager": page_detail,
            "page_name": "rfi",
            "default_url": "/my/rfis",
        }
        return request.render("construction_portal.portal_my_rfis", values)

    @http.route(["/my/rfi/<int:rfi_id>"], type="http", auth="user",
                website=True)
    def portal_my_rfi(self, rfi_id, access_token=None, **kw):
        try:
            rfi_sudo = self._document_check_access(
                "construction.rfi", rfi_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        return request.render(
            "construction_portal.portal_rfi_page", {
                "rfi": rfi_sudo, "page_name": "rfi"})

    # ------------------------------------------------------------------
    # Defects
    # ------------------------------------------------------------------
    @http.route(["/my/defects", "/my/defects/page/<int:page>"], type="http",
                auth="user", website=True)
    def portal_my_defects(self, page=1, **kw):
        page_detail, defects = self._construction_list(
            "construction.defect", "/my/defects", page)
        values = {
            "defects": defects,
            "pager": page_detail,
            "page_name": "defect",
            "default_url": "/my/defects",
        }
        return request.render("construction_portal.portal_my_defects", values)

    @http.route(["/my/defect/<int:defect_id>"], type="http", auth="user",
                website=True)
    def portal_my_defect(self, defect_id, access_token=None, **kw):
        try:
            defect_sudo = self._document_check_access(
                "construction.defect", defect_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        return request.render(
            "construction_portal.portal_defect_page", {
                "defect": defect_sudo, "page_name": "defect"})

    @http.route(["/my/defect/<int:defect_id>/ready"], type="http",
                auth="user", website=True, methods=["POST"])
    def portal_my_defect_ready(self, defect_id, access_token=None, **kw):
        """Let the responsible subcontractor mark a defect ready for
        inspection — the one write action exposed on the portal."""
        try:
            defect_sudo = self._document_check_access(
                "construction.defect", defect_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        if defect_sudo.state in ("open", "in_progress", "reopened"):
            defect_sudo.action_ready()
        return request.redirect(f"/my/defect/{defect_id}")

    # ------------------------------------------------------------------
    # Subcontracts
    # ------------------------------------------------------------------
    @http.route(["/my/subcontracts", "/my/subcontracts/page/<int:page>"],
                type="http", auth="user", website=True)
    def portal_my_subcontracts(self, page=1, **kw):
        page_detail, subs = self._construction_list(
            "construction.subcontract", "/my/subcontracts", page)
        values = {
            "subcontracts": subs,
            "pager": page_detail,
            "page_name": "subcontract",
            "default_url": "/my/subcontracts",
        }
        return request.render(
            "construction_portal.portal_my_subcontracts", values)

    @http.route(["/my/subcontract/<int:sub_id>"], type="http", auth="user",
                website=True)
    def portal_my_subcontract(self, sub_id, access_token=None, **kw):
        try:
            sub_sudo = self._document_check_access(
                "construction.subcontract", sub_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        return request.render(
            "construction_portal.portal_subcontract_page", {
                "subcontract": sub_sudo, "page_name": "subcontract"})
