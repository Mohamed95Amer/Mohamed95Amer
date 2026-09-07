"""Cheques and documents: two things with dates on them.

A cheque is an instrument, not a payment, and it can fail after it has
changed hands. A document is a file with an expiry nobody watches unless
something is watching it.
"""

from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestCheques(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.cheque"])
        cls.development = cls.env["majal.development"].create(
            {"name": "Cheque Heights", "code": "CHQ"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower C", "code": "C", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 1", "number": 1, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "C-0101", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available"})
        cls.buyer = cls.env["res.partner"].create({"name": "Cheque Buyer"})
        cls.plan = cls.env["majal.payment.plan"].create({
            "name": "All on booking",
            "line_ids": [(0, 0, {"name": "On booking", "percentage": 100,
                                 "trigger": "booking"})],
        })
        cls.reservation = cls.env["majal.reservation"].create({
            "unit_id": cls.unit.id, "partner_id": cls.buyer.id,
            "sale_price": 1000000, "payment_plan_id": cls.plan.id,
        })
        cls.reservation.action_generate_schedule()
        cls.installment = cls.reservation.installment_ids[0]

    def _cheque(self, **vals):
        return self.env["majal.cheque"].create({
            "name": "000451", "partner_id": self.buyer.id,
            "bank_name": "Test Bank", "amount": 1000000,
            "due_date": self.today, "installment_id": self.installment.id,
            **vals,
        })

    def test_a_held_cheque_has_not_paid_anything_yet(self):
        """Handing over a cheque is not paying. Counting it as payment is
        how a schedule shows settled against money that never arrived."""
        self._cheque()
        self.assertEqual(self.installment.amount_paid, 0)
        self.assertEqual(self.installment.state, "pending")

    def test_clearing_a_cheque_settles_what_it_was_for(self):
        cheque = self._cheque()
        cheque.action_deposit()
        cheque.action_clear()
        self.assertEqual(cheque.state, "cleared")
        self.assertEqual(self.installment.amount_paid, 1000000)
        self.assertEqual(self.installment.state, "paid")
        self.assertTrue(self.installment.payment_date)

    def test_a_bounced_cheque_takes_its_money_back_out(self):
        """A settled instalment behind a bounced cheque is a lie the
        collections team would act on."""
        cheque = self._cheque()
        cheque.action_clear()
        self.assertEqual(self.installment.state, "paid")

        cheque.action_bounce()
        self.assertEqual(cheque.state, "bounced")
        self.assertEqual(self.installment.amount_paid, 0)
        self.assertEqual(self.installment.state, "pending")

    def test_a_cheque_that_never_cleared_takes_nothing_back(self):
        cheque = self._cheque()
        cheque.action_deposit()
        cheque.action_bounce()
        self.assertEqual(self.installment.amount_paid, 0)

    def test_a_cleared_cheque_cannot_be_cancelled_or_returned(self):
        cheque = self._cheque()
        cheque.action_clear()
        with self.assertRaises(UserError):
            cheque.action_cancel()
        with self.assertRaises(UserError):
            cheque.action_return()

    def test_cheques_due_for_banking_are_searchable(self):
        due = self._cheque(due_date=self.today - timedelta(days=1))
        self._cheque(name="000452", due_date=self.today + timedelta(days=30))
        found = self.env["majal.cheque"].search([("is_due", "=", True)])
        self.assertIn(due, found)
        self.assertEqual(len(found.filtered(lambda c: c.partner_id == self.buyer)), 1)

    def test_two_cheques_cannot_share_a_number_from_one_drawer(self):
        self._cheque()
        with self.assertRaises(Exception):
            with self.env.cr.savepoint():
                self._cheque()
                self.env["majal.cheque"].flush_model()


@tagged("post_install", "-at_install")
class TestPropertyDocuments(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.property.document"])

    def _document(self, **vals):
        return self.env["majal.property.document"].create({
            "name": "Tenancy contract", "document_type": "tenancy_contract", **vals})

    def test_a_document_with_no_expiry_never_lapses(self):
        document = self._document(document_type="title_deed")
        self.assertEqual(document.state, "permanent")

    def test_a_document_inside_its_reminder_window_reads_as_expiring(self):
        document = self._document(
            expiry_date=self.today + timedelta(days=10), reminder_days=30)
        self.assertEqual(document.state, "expiring")
        self.assertEqual(document.days_to_expiry, 10)

    def test_a_document_past_its_date_reads_as_expired(self):
        document = self._document(expiry_date=self.today - timedelta(days=1))
        self.assertEqual(document.state, "expired")

    def test_a_document_well_inside_its_term_is_simply_valid(self):
        document = self._document(
            expiry_date=self.today + timedelta(days=200), reminder_days=30)
        self.assertEqual(document.state, "valid")

    def test_a_document_cannot_expire_before_it_was_issued(self):
        with self.assertRaises(UserError):
            self._document(
                issue_date=self.today,
                expiry_date=self.today - timedelta(days=1))

    def test_expiring_documents_are_searchable_because_the_state_is_stored(self):
        """The point of the model over an attachment: you can ask it what is
        about to lapse."""
        self._document(expiry_date=self.today + timedelta(days=5))
        self._document(name="Deed", document_type="title_deed")
        expiring = self.env["majal.property.document"].search(
            [("state", "=", "expiring")])
        self.assertEqual(len(expiring), 1)

    def test_the_cron_raises_an_activity_on_something_about_to_lapse(self):
        document = self._document(expiry_date=self.today + timedelta(days=5))
        self.env["majal.property.document"]._cron_flag_expiring_documents()
        self.assertTrue(document.activity_ids)

    def test_renewing_opens_a_copy_dated_forward(self):
        document = self._document(expiry_date=self.today + timedelta(days=5))
        action = document.action_renew()
        renewal = self.env["majal.property.document"].browse(action["res_id"])
        self.assertEqual(renewal.issue_date, document.expiry_date)
        self.assertGreater(renewal.expiry_date, document.expiry_date)
