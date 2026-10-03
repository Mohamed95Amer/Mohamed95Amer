from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request
from odoo.addons.portal.controllers.portal import CustomerPortal, pager


class FacilityPortal(CustomerPortal):
    """Occupant self-service for facility requests."""

    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if "facility_request_count" in counters:
            values["facility_request_count"] = request.env[
                "maintenance.request"].search_count([])
        return values

    @http.route(["/my/facility/requests", "/my/facility/requests/page/<int:page>"],
                type="http", auth="user", website=True)
    def portal_facility_requests(self, page=1, **kw):
        Request = request.env["maintenance.request"]
        total = Request.search_count([])
        page_detail = pager(
            url="/my/facility/requests", total=total, page=page,
            step=self._items_per_page)
        requests = Request.search(
            [], limit=self._items_per_page, offset=page_detail["offset"],
            order="id desc")
        # The record rule has already narrowed this to the occupant's own
        # requests. Handing the whole recordset to the template with sudo()
        # would then read every field on it as superuser — convenient, and one
        # template edit away from showing something it should not. Only the
        # values the page actually needs are escalated, and only because the
        # stage and equipment names live on models portal users cannot read.
        rows = [{
            "id": record.id,
            "name": record.name,
            "equipment": record.sudo().equipment_id.name or "",
            "stage": record.sudo().stage_id.name or "",
            "deadline": record.sudo().sla_resolution_deadline,
        } for record in requests]
        return request.render("facility_portal.portal_my_requests", {
            "requests": rows,
            "pager": page_detail,
            "page_name": "facility_request",
            "default_url": "/my/facility/requests",
        })

    @http.route(["/my/facility/request/<int:request_id>"], type="http",
                auth="user", website=True)
    def portal_facility_request(self, request_id, access_token=None, **kw):
        try:
            record = self._document_check_access(
                "maintenance.request", request_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        return request.render("facility_portal.portal_request_page", {
            "task": record, "page_name": "facility_request"})

    @http.route(["/my/facility/request/new"], type="http", auth="user",
                website=True)
    def portal_new_request_form(self, **kw):
        equipment = request.env["maintenance.equipment"].sudo().search(
            [("portal_selectable", "=", True)], limit=80, order="name")
        return request.render("facility_portal.portal_new_request", {
            "equipments": equipment,
            "page_name": "facility_request",
            "error": kw.get("error"),
        })

    @http.route(["/my/facility/request/submit"], type="http", auth="user",
                website=True, methods=["POST"])
    def portal_submit_request(self, **post):
        name = (post.get("name") or "").strip()
        if not name:
            return request.redirect(
                "/my/facility/request/new?error=Describe%20the%20problem")

        partner = request.env.user.partner_id
        values = {
            "name": name,
            "description": post.get("description") or "",
            "portal_reporter_id": partner.id,
            # Raised through the portal by an occupant, so it is corrective by
            # definition — planned work never arrives this way.
            "maintenance_type": "corrective",
        }
        equipment_id = post.get("equipment_id")
        if equipment_id and equipment_id.isdigit():
            # Whatever the form offered, the value came from the client. Only an
            # asset that was actually published is accepted.
            offered = request.env["maintenance.equipment"].sudo().search([
                ("id", "=", int(equipment_id)),
                ("portal_selectable", "=", True),
            ], limit=1)
            if offered:
                values["equipment_id"] = offered.id

        record = request.env["maintenance.request"].sudo().create(values)
        return request.redirect(f"/my/facility/request/{record.id}")
