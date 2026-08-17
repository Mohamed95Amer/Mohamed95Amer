"""What a buyer can and cannot see of the sales system.

The portal exposes exactly two things -- a buyer's own reservations and
the installments under them -- so the tests that matter are the negative
ones: another buyer's paperwork, and a half-built draft, must not be
reachable.
"""

from odoo.exceptions import AccessError
from odoo.tests import HttpCase, tagged


@tagged("post_install", "-at_install")
class TestPortalAccess(HttpCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Marina Heights (test)", "code": "MHTEST"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower A", "code": "A", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.unit_buyer = cls.env["majal.unit"].create({
            "name": "A-1601", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available",
        })
        cls.unit_other = cls.env["majal.unit"].create({
            "name": "A-1602", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available",
        })

        portal_group = cls.env.ref("base.group_portal")
        cls.buyer_user = cls.env["res.users"].create({
            "name": "Portal Buyer",
            "login": "majal_portal_buyer",
            "password": "majal_portal_buyer_pw",
            "groups_id": [(6, 0, [portal_group.id])],
        })
        cls.other_partner = cls.env["res.partner"].create({"name": "Someone Else"})

        cls.reservation = cls.env["majal.reservation"].create({
            "unit_id": cls.unit_buyer.id,
            "partner_id": cls.buyer_user.partner_id.id,
            "sale_price": 1000000,
        })
        cls.reservation.action_confirm()

        cls.other_reservation = cls.env["majal.reservation"].create({
            "unit_id": cls.unit_other.id,
            "partner_id": cls.other_partner.id,
            "sale_price": 1000000,
        })
        cls.other_reservation.action_confirm()

    def test_a_buyer_sees_their_own_reservation_and_not_anyone_elses(self):
        visible = self.env["majal.reservation"].with_user(
            self.buyer_user).search([])
        self.assertEqual(visible, self.reservation)

    def test_a_buyer_cannot_read_another_buyers_reservation_directly(self):
        with self.assertRaises(AccessError):
            self.other_reservation.with_user(self.buyer_user).read(["sale_price"])

    def test_a_buyer_cannot_write_to_their_own_reservation(self):
        """Read-only means read-only: the portal is a window onto the deal,
        not a way to renegotiate it."""
        with self.assertRaises(AccessError):
            self.reservation.with_user(self.buyer_user).write({"sale_price": 1})

    def test_the_portal_list_page_shows_the_buyers_own_units(self):
        self.authenticate("majal_portal_buyer", "majal_portal_buyer_pw")
        response = self.url_open("/my/reservations")
        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertIn(self.reservation.name, body)
        self.assertIn("A-1601", body)
        self.assertNotIn("A-1602", body)

    def test_the_portal_detail_page_shows_the_payment_schedule(self):
        self.env["majal.payment.installment"].create({
            "reservation_id": self.reservation.id,
            "name": "On booking",
            "due_date": self.reservation.reservation_date,
            "amount": 200000,
        })
        self.authenticate("majal_portal_buyer", "majal_portal_buyer_pw")
        response = self.url_open(f"/my/reservation/{self.reservation.id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("On booking", response.text)

    def test_the_portal_detail_page_of_another_buyer_is_not_served(self):
        self.authenticate("majal_portal_buyer", "majal_portal_buyer_pw")
        response = self.url_open(
            f"/my/reservation/{self.other_reservation.id}", allow_redirects=False)
        self.assertIn(response.status_code, (302, 303))

    def test_a_draft_reservation_is_not_published_to_the_buyer(self):
        """Internal paperwork that is still being put together is not
        something to show the buyer."""
        draft = self.env["majal.reservation"].create({
            "unit_id": self.env["majal.unit"].create({
                "name": "A-1603", "floor_id": self.floor.id,
                "list_price": 1000000, "status": "available",
            }).id,
            "partner_id": self.buyer_user.partner_id.id,
            "sale_price": 1000000,
        })
        self.authenticate("majal_portal_buyer", "majal_portal_buyer_pw")
        response = self.url_open("/my/reservations")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(draft.name, response.text)
