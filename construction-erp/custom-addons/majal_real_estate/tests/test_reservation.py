"""Reservations are what make a unit unsellable to anyone else.

The rules that matter here are not the state names, they are the
consequences: confirming takes a unit off the market, cancelling or
expiring puts it back, converting takes it off permanently, and no two
buyers can ever hold the same unit at once.
"""

from datetime import timedelta

from psycopg2 import IntegrityError

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class TestReservation(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Marina Heights (test)", "code": "MHTEST"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower A", "code": "A", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "A-1601", "floor_id": cls.floor.id,
            "list_price": 1180000, "status": "available",
        })
        cls.buyer = cls.env["res.partner"].create({"name": "Test Buyer"})
        cls.other_buyer = cls.env["res.partner"].create({"name": "Other Buyer"})

    def _reservation(self, **vals):
        return self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            **vals,
        })

    def test_a_new_reservation_gets_a_reference_and_snapshots_the_list_price(self):
        reservation = self._reservation()
        self.assertNotEqual(reservation.name, "/")
        self.assertEqual(reservation.unit_price, 1180000)

    def test_the_price_snapshot_survives_a_later_list_price_change(self):
        """The quoted price is the whole point of the snapshot: repricing
        the unit afterwards must not rewrite what the buyer was told."""
        reservation = self._reservation()
        self.unit.list_price = 1350000
        reservation.invalidate_recordset()
        self.assertEqual(reservation.unit_price, 1180000)

    def test_confirming_takes_the_unit_off_the_market(self):
        reservation = self._reservation()
        reservation.action_confirm()
        self.assertEqual(reservation.state, "confirmed")
        self.assertEqual(self.unit.status, "reserved")
        self.assertEqual(self.unit.active_reservation_id, reservation)

    def test_a_unit_that_is_not_available_cannot_be_reserved(self):
        self.unit.status = "blocked"
        with self.assertRaises(UserError):
            self._reservation().action_confirm()
        self.assertEqual(self.unit.status, "blocked")

    def test_a_second_buyer_cannot_confirm_a_held_unit(self):
        self._reservation().action_confirm()
        second = self._reservation(partner_id=self.other_buyer.id)
        with self.assertRaises(UserError):
            second.action_confirm()
        self.assertEqual(second.state, "draft")

    @mute_logger("odoo.sql_db")
    def test_double_booking_is_blocked_by_the_database_not_only_by_code(self):
        """Non-vacuous check that the guarantee is real: two salespeople in
        concurrent transactions can both pass the application-level check,
        so this writes the state directly -- exactly what a race would do --
        and the partial unique index must still refuse it."""
        self._reservation().action_confirm()
        second = self._reservation(partner_id=self.other_buyer.id)
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                second.write({"state": "confirmed"})
                second.flush_recordset()

    def test_cancelling_a_confirmed_reservation_returns_the_unit_to_the_pool(self):
        reservation = self._reservation()
        reservation.action_confirm()
        reservation.action_cancel()
        self.assertEqual(reservation.state, "cancelled")
        self.assertEqual(self.unit.status, "available")
        self.assertFalse(self.unit.active_reservation_id)

    def test_cancelling_frees_the_unit_for_the_next_buyer(self):
        first = self._reservation()
        first.action_confirm()
        first.action_cancel()
        second = self._reservation(partner_id=self.other_buyer.id)
        second.action_confirm()
        self.assertEqual(self.unit.status, "reserved")
        self.assertEqual(self.unit.active_reservation_id, second)

    def test_converting_marks_the_unit_sold(self):
        reservation = self._reservation()
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        self.assertEqual(reservation.state, "converted")
        self.assertEqual(self.unit.status, "sold")

    def test_a_converted_reservation_cannot_be_cancelled_back(self):
        """Undoing a sale by cancelling the reservation would silently put a
        sold unit back on the market."""
        reservation = self._reservation()
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        with self.assertRaises(UserError):
            reservation.action_cancel()
        self.assertEqual(self.unit.status, "sold")

    def test_the_expiry_cron_releases_lapsed_holds_and_leaves_live_ones_alone(self):
        today = fields.Date.context_today(self.env["majal.reservation"])
        lapsed = self._reservation(
            reservation_date=today - timedelta(days=30),
            expiry_date=today - timedelta(days=16),
        )
        lapsed.action_confirm()

        other_unit = self.env["majal.unit"].create({
            "name": "A-1602", "floor_id": self.floor.id, "status": "available"})
        live = self._reservation(
            unit_id=other_unit.id, expiry_date=today + timedelta(days=7))
        live.action_confirm()

        self.env["majal.reservation"]._cron_expire_reservations()

        self.assertEqual(lapsed.state, "expired")
        self.assertEqual(self.unit.status, "available")
        self.assertEqual(live.state, "confirmed")
        self.assertEqual(other_unit.status, "reserved")

    def test_a_confirmed_reservation_cannot_be_deleted_while_it_holds_a_unit(self):
        """Deleting the hold without releasing it would strand the unit as
        reserved with nothing pointing at it."""
        reservation = self._reservation()
        reservation.action_confirm()
        with self.assertRaises(UserError):
            reservation.unlink()
        reservation.action_cancel()
        reservation.unlink()
        self.assertEqual(self.unit.status, "available")

    def test_a_reservation_cannot_expire_before_it_starts(self):
        today = fields.Date.context_today(self.env["majal.reservation"])
        with self.assertRaises(ValidationError):
            self._reservation(
                reservation_date=today, expiry_date=today - timedelta(days=1))

    def test_a_cancelled_reservation_can_be_reopened_and_reconfirmed(self):
        reservation = self._reservation()
        reservation.action_confirm()
        reservation.action_cancel()
        reservation.action_reset_to_draft()
        self.assertEqual(reservation.state, "draft")
        reservation.action_confirm()
        self.assertEqual(self.unit.status, "reserved")
