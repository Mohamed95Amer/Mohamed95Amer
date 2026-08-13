"""Leads into reservations, and reservations into broker commissions.

Both ends of this are about timing: an enquiry becomes a hold only once
there is a real contact to hold it for, and a broker earns only once the
hold becomes a sale.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestSalesPipeline(TransactionCase):
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
        cls.broker = cls.env["res.partner"].create({
            "name": "Test Brokerage", "is_majal_broker": True,
            "broker_commission_rate": 2.0,
        })

    def _reservation(self, **vals):
        return self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            "sale_price": 1000000,
            **vals,
        })

    # --- Broker commissions ------------------------------------------------

    def test_no_commission_is_raised_while_the_deal_is_only_a_hold(self):
        """A hold that lapses has earned nobody anything, so confirming
        must not create a payable."""
        reservation = self._reservation(
            broker_id=self.broker.id, commission_rate=2.0)
        reservation.action_confirm()
        self.assertFalse(reservation.commission_ids)

    def test_converting_raises_the_broker_commission(self):
        reservation = self._reservation(
            broker_id=self.broker.id, commission_rate=2.0)
        self.assertEqual(reservation.commission_amount, 20000)
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        commission = reservation.commission_ids
        self.assertEqual(len(commission), 1)
        self.assertEqual(commission.broker_id, self.broker)
        self.assertEqual(commission.amount, 20000)
        self.assertEqual(commission.rate, 2.0)
        self.assertEqual(commission.state, "draft")

    def test_a_deal_without_a_broker_raises_nothing(self):
        reservation = self._reservation()
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        self.assertFalse(reservation.commission_ids)

    def test_a_commission_must_be_approved_before_it_can_be_paid(self):
        reservation = self._reservation(
            broker_id=self.broker.id, commission_rate=2.0)
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        commission = reservation.commission_ids
        with self.assertRaises(UserError):
            commission.action_mark_paid()
        commission.action_approve()
        commission.action_mark_paid()
        self.assertEqual(commission.state, "paid")
        self.assertTrue(commission.payment_date)

    def test_a_paid_commission_cannot_be_cancelled(self):
        reservation = self._reservation(
            broker_id=self.broker.id, commission_rate=2.0)
        reservation.action_confirm()
        reservation.action_convert_to_sale()
        commission = reservation.commission_ids
        commission.action_approve()
        commission.action_mark_paid()
        with self.assertRaises(UserError):
            commission.action_cancel()

    # --- Leads -------------------------------------------------------------

    def _lead(self, **vals):
        return self.env["majal.lead"].create({
            "name": "2BR enquiry",
            "development_id": self.development.id,
            **vals,
        })

    def test_a_new_lead_lands_in_the_first_stage_and_is_open(self):
        lead = self._lead()
        self.assertEqual(lead.state, "open")
        self.assertTrue(lead.stage_id)
        self.assertEqual(
            lead.stage_id, self.env.ref("majal_real_estate.lead_stage_new"))

    def test_a_lead_without_a_contact_cannot_reserve_a_unit(self):
        """A reservation names who is holding the unit, and "someone who
        emailed us" is not a party you can hold inventory for."""
        lead = self._lead(contact_name="Anonymous Walk-in")
        with self.assertRaises(UserError):
            lead.action_create_reservation()

    def test_a_lead_with_a_contact_opens_a_prefilled_reservation(self):
        lead = self._lead(partner_id=self.buyer.id)
        action = lead.action_create_reservation()
        self.assertEqual(action["res_model"], "majal.reservation")
        self.assertEqual(action["context"]["default_partner_id"], self.buyer.id)
        self.assertEqual(action["context"]["default_lead_id"], lead.id)

    def test_converting_a_reservation_wins_the_lead_behind_it(self):
        lead = self._lead(partner_id=self.buyer.id)
        reservation = self._reservation(lead_id=lead.id)
        reservation.action_confirm()
        self.assertEqual(lead.state, "open")

        reservation.action_convert_to_sale()
        self.assertEqual(lead.state, "won")
        self.assertTrue(lead.stage_id.is_won)
        self.assertEqual(lead.reservation_count, 1)

    def test_a_lost_lead_can_be_reopened(self):
        lead = self._lead()
        lead.lost_reason = "Bought elsewhere"
        lead.action_mark_lost()
        self.assertEqual(lead.state, "lost")
        lead.action_reopen()
        self.assertEqual(lead.state, "open")
        self.assertFalse(lead.lost_reason)
