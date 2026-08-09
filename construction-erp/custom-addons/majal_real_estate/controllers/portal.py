from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request
from odoo.addons.portal.controllers.portal import CustomerPortal, pager as portal_pager


class MajalRealEstatePortal(CustomerPortal):
    """What a buyer can see of their own purchase: the units they hold and
    what they owe on them. Nothing else in the module is exposed."""

    def _prepare_home_portal_values(self, counters):
        values = super()._prepare_home_portal_values(counters)
        if "reservation_count" in counters:
            values["reservation_count"] = request.env["majal.reservation"].search_count(
                self._majal_reservation_domain())
        return values

    def _majal_reservation_domain(self):
        # A buyer sees the holds in their own name. Draft reservations are
        # excluded: an internal salesperson may still be putting one
        # together, and half-built paperwork is not something to publish to
        # the buyer.
        partner = request.env.user.partner_id
        return [
            ("partner_id", "child_of", partner.commercial_partner_id.id),
            ("state", "!=", "draft"),
        ]

    @http.route(["/my/reservations", "/my/reservations/page/<int:page>"],
                type="http", auth="user", website=True)
    def portal_my_reservations(self, page=1, **kw):
        Reservation = request.env["majal.reservation"]
        domain = self._majal_reservation_domain()
        total = Reservation.search_count(domain)
        pager = portal_pager(
            url="/my/reservations",
            total=total,
            page=page,
            step=self._items_per_page,
        )
        # Searched as the portal user so the record rule decides what is
        # theirs, then rendered sudo: the template walks to the unit and
        # development, which buyers have no read access to in their own
        # right and should not be given.
        reservations = Reservation.search(
            domain, limit=self._items_per_page, offset=pager["offset"]).sudo()
        return request.render(
            "majal_real_estate.portal_my_reservations",
            {
                "reservations": reservations,
                "page_name": "reservation",
                "pager": pager,
                "default_url": "/my/reservations",
            },
        )

    @http.route(["/my/reservation/<int:reservation_id>"],
                type="http", auth="public", website=True)
    def portal_my_reservation_detail(self, reservation_id, access_token=None, **kw):
        try:
            reservation_sudo = self._document_check_access(
                "majal.reservation", reservation_id, access_token)
        except (AccessError, MissingError):
            return request.redirect("/my")
        return request.render(
            "majal_real_estate.portal_reservation_page",
            {
                "reservation": reservation_sudo,
                "page_name": "reservation",
                "token": access_token,
            },
        )
