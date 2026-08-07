"""The advance, and the deduction that repays it.

Recovering too little leaves the employer exposed at the end of a job.
Recovering too much takes money the contractor is owed, on a deduction nobody
re-reads once it runs automatically. Both are arithmetic, so both are asserted
here rather than trusted.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestAdvancePayment(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.client = cls.env["res.partner"].create({"name": "Employer LLC"})
        cls.project = cls.env["project.project"].create({
            "name": "Advance Tower",
            "is_construction": True,
            "client_id": cls.client.id,
            "retention_percent": 0.0,       # isolate the advance arithmetic
            "retention_cap_percent": 0.0,
        })
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id})
        cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Works",
            "quantity": 1, "unit_rate": 1000000})
        cls.boq.action_approve()            # contract 1,000,000

    def _advance(self, **vals):
        advance = self.env["construction.advance.payment"].create({
            "project_id": self.project.id,
            "amount": 100000.0,             # 10% of contract
            "recovery_percent": 20.0,
            **vals,
        })
        advance.action_submit()
        advance.action_approve()
        return advance

    def _claim(self, qty):
        claim = self.env["construction.progress.claim"].create({
            "project_id": self.project.id, "boq_id": self.boq.id})
        claim.line_ids.qty_this_period = qty
        return claim

    def _certified(self, qty):
        claim = self._claim(qty)
        claim.action_submit()
        claim.action_certify()
        return claim

    # ------------------------------------------------------------------
    # Recovery
    # ------------------------------------------------------------------
    def test_recovery_is_a_share_of_the_work_certified(self):
        self._advance()
        claim = self._claim(0.25)           # 250,000 certified
        self.assertEqual(claim.advance_recovery_cumulative, 50000)  # 20%
        self.assertEqual(claim.advance_recovery_this, 50000)
        # 250,000 done, no retention, less 50,000 recovery
        self.assertEqual(claim.amount_due, 200000)

    def test_recovery_is_taken_period_by_period_not_repeated(self):
        self._advance()
        first = self._certified(0.25)
        self.assertEqual(first.advance_recovery_this, 50000)

        second = self._claim(0.25)          # cumulative 500,000
        self.assertEqual(second.advance_recovery_cumulative, 100000)
        # only the increment is deducted this period
        self.assertEqual(second.advance_recovery_this, 50000)

    def test_recovery_never_exceeds_the_advance(self):
        """The failure that takes money the contractor is owed: a long job
        keeps deducting past the point the advance is repaid."""
        self._advance()
        claim = self._claim(1.0)            # 1,000,000 certified, 20% = 200,000
        self.assertEqual(claim.advance_recovery_cumulative, 100000)  # clamped
        self.assertEqual(claim.amount_due, 900000)

    def test_once_repaid_later_certificates_deduct_nothing(self):
        advance = self._advance()
        self._certified(0.5)                # recovers the full 100,000
        later = self._claim(0.5)
        self.assertEqual(later.advance_recovery_cumulative, 100000)
        self.assertEqual(later.advance_recovery_this, 0)
        self.assertEqual(later.amount_due, 500000)

        advance.invalidate_recordset()
        self.assertTrue(advance.recovery_complete)
        self.assertEqual(advance.amount_outstanding, 0)

    def test_recovery_can_be_deferred_until_the_job_is_under_way(self):
        """Contracts often let the contractor keep the advance until real
        progress has been made."""
        self._advance(recovery_start_percent=20.0)   # nothing until 200,000
        early = self._claim(0.1)                     # 100,000 certified
        self.assertEqual(early.advance_recovery_cumulative, 0)
        self.assertEqual(early.amount_due, 100000)

        # Certificates chain, so this period's 0.4 lands on the previous
        # 0.1 — cumulative 0.5 of the contract, not 0.4.
        later = self._claim(0.4)
        self.assertEqual(later.amount_work_done_cumulative, 500000)
        # eligible = 500,000 - 200,000 = 300,000, at 20% = 60,000
        self.assertEqual(later.advance_recovery_cumulative, 60000)

    def test_a_draft_advance_recovers_nothing(self):
        """Nothing has been paid out, so nothing is repaid."""
        self.env["construction.advance.payment"].create({
            "project_id": self.project.id, "amount": 100000.0})
        claim = self._claim(0.25)
        self.assertFalse(claim.advance_id)
        self.assertEqual(claim.advance_recovery_cumulative, 0)
        self.assertEqual(claim.amount_due, 250000)

    def test_the_position_is_reported_on_the_advance(self):
        advance = self._advance()
        self._certified(0.25)
        advance.invalidate_recordset()
        self.assertEqual(advance.amount_recovered, 50000)
        self.assertEqual(advance.amount_outstanding, 50000)

    # ------------------------------------------------------------------
    # Guards
    # ------------------------------------------------------------------
    def test_two_live_advances_on_one_project_are_refused(self):
        """Each would claim its own slice of the same certificate and the
        deduction would silently double."""
        self._advance()
        second = self.env["construction.advance.payment"].create({
            "project_id": self.project.id, "amount": 50000.0})
        with self.assertRaises(UserError):
            second.action_submit()

    def test_a_recovery_rate_of_zero_is_refused(self):
        with self.assertRaises(UserError):
            self.env["construction.advance.payment"].create({
                "project_id": self.project.id, "amount": 100000.0,
                "recovery_percent": 0.0})

    def test_an_advance_already_recovered_cannot_be_cancelled(self):
        advance = self._advance()
        advance.action_create_invoice()
        self._certified(0.25)
        advance.invalidate_recordset()
        with self.assertRaises(UserError):
            advance.action_cancel()

    def test_a_lapsed_guarantee_is_flagged(self):
        from datetime import date, timedelta
        advance = self._advance(
            guarantee_expiry=date.today() - timedelta(days=1),
            guarantee_reference="APG-001")
        advance.invalidate_recordset()
        self.assertTrue(advance.guarantee_lapsed)
        self.assertIn("unsecured", advance.guarantee_warning)

    def test_a_live_guarantee_is_not_flagged(self):
        from datetime import date, timedelta
        advance = self._advance(
            guarantee_expiry=date.today() + timedelta(days=90))
        self.assertFalse(advance.guarantee_lapsed)

    # ------------------------------------------------------------------
    # Money out
    # ------------------------------------------------------------------
    def test_invoicing_the_advance_bills_the_client(self):
        advance = self._advance()
        advance.action_create_invoice()
        self.assertEqual(advance.state, "invoiced")
        self.assertEqual(advance.move_id.partner_id, self.client)
        self.assertEqual(advance.move_id.amount_untaxed, 100000)

    def test_the_certificate_invoice_names_the_deduction(self):
        """A net figure with no explanation is what a client's accounts
        department queries."""
        self._advance()
        claim = self._certified(0.25)
        claim.action_create_invoice()
        line = claim.move_id.invoice_line_ids[0]
        self.assertIn("advance recovery", line.name)

    def test_a_project_with_no_advance_bills_exactly_as_before(self):
        """The recovery must not disturb the arithmetic where there is none."""
        claim = self._claim(0.25)
        self.assertEqual(claim.advance_recovery_this, 0)
        self.assertEqual(claim.amount_due, 250000)
