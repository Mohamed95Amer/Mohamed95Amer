"""Handover: the point where a unit stops being inventory.

Everything here is a gate. A unit should be hard to hand over by
accident, because handing one over is what transfers it to somebody else
and there is no clean way back.
"""

from psycopg2 import IntegrityError

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class TestHandover(TransactionCase):
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
            "list_price": 1000000, "status": "available",
        })
        cls.buyer = cls.env["res.partner"].create({"name": "Test Buyer"})
        cls.plan = cls.env["majal.payment.plan"].create({
            "name": "Full on booking",
            "line_ids": [
                (0, 0, {"name": "On booking", "percentage": 100,
                        "trigger": "booking"}),
            ],
        })

    def _sold_reservation(self, settled=True):
        reservation = self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            "sale_price": 1000000,
            "payment_plan_id": self.plan.id,
        })
        reservation.action_confirm()
        reservation.action_generate_schedule()
        if settled:
            reservation.installment_ids.action_mark_paid()
        reservation.action_convert_to_sale()
        return reservation

    def _handover(self, **vals):
        return self.env["majal.handover"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            **vals,
        })

    def _ready_handover(self, reservation=None):
        handover = self._handover(
            reservation_id=reservation.id if reservation else False,
            scheduled_date=self.env.cr.now().date(),
        )
        handover.action_schedule()
        handover.action_start_inspection()
        handover.action_mark_ready()
        return handover

    def test_a_new_handover_gets_a_reference(self):
        handover = self._handover()
        self.assertNotEqual(handover.name, "/")

    def test_a_handover_cannot_be_marked_ready_with_unverified_snags(self):
        handover = self._handover(scheduled_date=self.env.cr.now().date())
        handover.action_schedule()
        handover.action_start_inspection()
        self.env["majal.handover.snag"].create({
            "handover_id": handover.id, "name": "Chipped worktop"})
        with self.assertRaises(UserError):
            handover.action_mark_ready()
        self.assertEqual(handover.state, "inspection")

    def test_a_snag_must_be_fixed_before_it_can_be_verified(self):
        """Fixing and signing off are separate steps because the person who
        repairs a snag should not be the one who passes it."""
        handover = self._handover()
        snag = self.env["majal.handover.snag"].create({
            "handover_id": handover.id, "name": "Chipped worktop"})
        with self.assertRaises(UserError):
            snag.action_verify()
        snag.action_mark_fixed()
        snag.action_verify()
        self.assertEqual(snag.state, "verified")

    def test_clearing_the_snag_list_unblocks_the_handover(self):
        handover = self._handover(scheduled_date=self.env.cr.now().date())
        handover.action_schedule()
        handover.action_start_inspection()
        snag = self.env["majal.handover.snag"].create({
            "handover_id": handover.id, "name": "Chipped worktop"})
        snag.action_mark_fixed()
        snag.action_verify()
        handover.action_mark_ready()
        self.assertEqual(handover.state, "ready")
        self.assertEqual(handover.open_snag_count, 0)

    def test_a_handover_cannot_complete_while_money_is_still_owed(self):
        """Keys do not change hands on an unpaid unit."""
        reservation = self._sold_reservation(settled=False)
        handover = self._ready_handover(reservation)
        with self.assertRaises(UserError):
            handover.action_complete()
        self.assertEqual(handover.state, "ready")
        self.assertEqual(self.unit.status, "sold")

    def test_completing_transfers_the_unit_to_its_buyer(self):
        reservation = self._sold_reservation(settled=True)
        handover = self._ready_handover(reservation)
        handover.action_complete()
        self.assertEqual(handover.state, "completed")
        self.assertEqual(self.unit.status, "handed_over")
        self.assertEqual(self.unit.owner_id, self.buyer)
        self.assertTrue(handover.keys_handed)
        self.assertTrue(handover.completed_date)

    def test_a_handover_without_a_linked_sale_has_no_balance_to_check(self):
        handover = self._ready_handover()
        handover.action_complete()
        self.assertEqual(self.unit.status, "handed_over")

    def test_a_handover_cannot_skip_straight_to_completion(self):
        handover = self._handover()
        with self.assertRaises(UserError):
            handover.action_complete()

    @mute_logger("odoo.sql_db")
    def test_a_unit_cannot_have_two_live_handovers(self):
        """Two live handovers would each believe they are the one giving
        the unit away, so the database refuses the second."""
        self._handover()
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self._handover()
                self.env["majal.handover"].flush_model()

    def test_a_unit_can_be_handed_over_again_after_the_first_is_closed(self):
        """Resale means a unit is handed over more than once over its life;
        only concurrent handovers are barred, not consecutive ones."""
        first = self._ready_handover()
        first.action_complete()
        # In real use these are two separate requests. Inside one
        # transaction the completion has to reach the database before the
        # next insert, or the partial index still sees two live rows.
        first.flush_recordset()
        second = self._handover()
        self.assertTrue(second.id)

    def test_a_completed_handover_cannot_be_deleted_or_cancelled(self):
        handover = self._ready_handover()
        handover.action_complete()
        with self.assertRaises(UserError):
            handover.action_cancel()
        with self.assertRaises(UserError):
            handover.unlink()
