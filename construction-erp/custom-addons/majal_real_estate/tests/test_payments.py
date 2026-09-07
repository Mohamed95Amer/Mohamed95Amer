"""Payment plans and the schedules generated from them.

A plan is a template of percentages; a schedule is what a specific buyer
actually owes on specific dates. The things worth guarding are that the
schedule adds up to the agreed price exactly, that its dates follow the
right trigger, and that regenerating it can never erase a recorded
payment.
"""

from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPaymentSchedule(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.reservation"])
        cls.development = cls.env["majal.development"].create({
            "name": "Marina Heights (test)", "code": "MHTEST",
            "expected_handover_date": cls.today + timedelta(days=540),
        })
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
            "name": "20/50/30",
            "development_id": cls.development.id,
            "line_ids": [
                (0, 0, {"sequence": 10, "name": "On booking",
                        "percentage": 20, "trigger": "booking"}),
                (0, 0, {"sequence": 20, "name": "During construction",
                        "percentage": 50, "trigger": "days_after",
                        "offset_days": 180}),
                (0, 0, {"sequence": 30, "name": "On handover",
                        "percentage": 30, "trigger": "handover"}),
            ],
        })

    def _reservation(self, **vals):
        return self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            "sale_price": 1000000,
            "payment_plan_id": self.plan.id,
            **vals,
        })

    def test_a_plan_that_does_not_add_up_to_100_percent_is_refused(self):
        """A plan short of 100% would under-bill every buyer it is ever
        applied to, so it must not be storable in the first place."""
        with self.assertRaises(ValidationError):
            self.env["majal.payment.plan"].create({
                "name": "Broken",
                "line_ids": [
                    (0, 0, {"name": "Half", "percentage": 50, "trigger": "booking"}),
                ],
            })

    def test_generating_a_schedule_prices_and_dates_every_milestone(self):
        reservation = self._reservation()
        reservation.action_generate_schedule()
        installments = reservation.installment_ids
        self.assertEqual(len(installments), 3)
        self.assertEqual(installments.mapped("amount"), [200000, 500000, 300000])
        self.assertEqual(installments[0].due_date, reservation.reservation_date)
        self.assertEqual(
            installments[1].due_date, reservation.reservation_date + timedelta(days=180))
        self.assertEqual(
            installments[2].due_date, self.development.expected_handover_date)

    def test_the_schedule_always_adds_up_to_the_agreed_price(self):
        """Thirds of an odd price cannot be represented exactly, so the
        last milestone has to absorb the difference -- otherwise the buyer
        is billed a little either side of what they signed."""
        plan = self.env["majal.payment.plan"].create({
            "name": "Thirds",
            "line_ids": [
                (0, 0, {"sequence": 10, "name": "First", "percentage": 33.34,
                        "trigger": "booking"}),
                (0, 0, {"sequence": 20, "name": "Second", "percentage": 33.33,
                        "trigger": "days_after", "offset_days": 90}),
                (0, 0, {"sequence": 30, "name": "Third", "percentage": 33.33,
                        "trigger": "days_after", "offset_days": 180}),
            ],
        })
        reservation = self._reservation(payment_plan_id=plan.id, sale_price=1000001)
        reservation.action_generate_schedule()
        amounts = reservation.installment_ids.mapped("amount")
        self.assertAlmostEqual(sum(amounts), 1000001, places=2)
        # The last two milestones claim the same percentage, so if they
        # differ it is because the last one absorbed the rounding.
        self.assertNotEqual(amounts[1], amounts[2])
        self.assertAlmostEqual(reservation.amount_scheduled, 1000001, places=2)

    def test_a_handover_milestone_needs_a_handover_date(self):
        self.development.expected_handover_date = False
        reservation = self._reservation()
        with self.assertRaises(UserError):
            reservation.action_generate_schedule()

    def test_regenerating_replaces_an_untouched_schedule(self):
        reservation = self._reservation()
        reservation.action_generate_schedule()
        first_ids = reservation.installment_ids.ids
        reservation.action_generate_schedule()
        self.assertEqual(len(reservation.installment_ids), 3)
        self.assertFalse(set(first_ids) & set(reservation.installment_ids.ids))

    def test_regenerating_is_refused_once_money_has_been_received(self):
        """Regeneration deletes installments. Doing that after a payment
        would destroy the record of the payment along with it."""
        reservation = self._reservation()
        reservation.action_generate_schedule()
        reservation.installment_ids[0].action_mark_paid()
        with self.assertRaises(UserError):
            reservation.action_generate_schedule()
        self.assertEqual(len(reservation.installment_ids), 3)
        self.assertEqual(reservation.amount_paid, 200000)

    def test_a_schedule_cannot_be_generated_without_a_price(self):
        reservation = self._reservation(sale_price=0)
        with self.assertRaises(UserError):
            reservation.action_generate_schedule()

    def test_installment_states_follow_what_has_been_received(self):
        reservation = self._reservation()
        reservation.action_generate_schedule()
        installment = reservation.installment_ids[0]
        self.assertEqual(installment.state, "pending")

        installment.amount_paid = 50000
        self.assertEqual(installment.state, "partial")
        self.assertEqual(installment.amount_residual, 150000)

        installment.action_mark_paid()
        self.assertEqual(installment.state, "paid")
        self.assertEqual(installment.amount_residual, 0)
        self.assertEqual(installment.payment_date, self.today)

    def test_reservation_totals_roll_up_from_the_schedule(self):
        reservation = self._reservation()
        reservation.action_generate_schedule()
        reservation.installment_ids[0].action_mark_paid()
        self.assertEqual(reservation.amount_scheduled, 1000000)
        self.assertEqual(reservation.amount_paid, 200000)
        self.assertEqual(reservation.amount_residual, 800000)
        self.assertEqual(
            reservation.next_due_date, reservation.installment_ids[1].due_date)

    def test_overdue_installments_are_flagged_and_searchable(self):
        """Overdue is computed, but a collections list is useless if you
        cannot filter by it, so it has to work as a search domain too."""
        reservation = self._reservation(
            reservation_date=self.today - timedelta(days=365),
            expiry_date=self.today - timedelta(days=351),
        )
        reservation.action_generate_schedule()
        overdue = reservation.installment_ids.filtered("is_overdue")
        self.assertTrue(overdue)

        searched = self.env["majal.payment.installment"].search([
            ("reservation_id", "=", reservation.id),
            ("is_overdue", "=", True),
        ])
        self.assertEqual(searched, overdue)

        not_overdue = self.env["majal.payment.installment"].search([
            ("reservation_id", "=", reservation.id),
            ("is_overdue", "=", False),
        ])
        self.assertEqual(not_overdue, reservation.installment_ids - overdue)

    def test_a_paid_installment_is_never_overdue(self):
        reservation = self._reservation(
            reservation_date=self.today - timedelta(days=365),
            expiry_date=self.today - timedelta(days=351),
        )
        reservation.action_generate_schedule()
        installment = reservation.installment_ids[0]
        self.assertTrue(installment.is_overdue)
        installment.action_mark_paid()
        self.assertFalse(installment.is_overdue)
