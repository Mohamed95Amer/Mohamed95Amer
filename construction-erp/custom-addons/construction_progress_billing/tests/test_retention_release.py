"""Getting retention back, and never getting back more than was held.

The dates on these certificates are contractual and vary; the arithmetic does
not. Most of what is asserted here is the arithmetic, because over-releasing
is the error that costs real money and is invisible by eye once a project has
twenty certificates against it.
"""

from datetime import date, timedelta

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestRetentionRelease(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.client = cls.env["res.partner"].create({"name": "Employer LLC"})
        cls.project = cls.env["project.project"].create({
            "name": "Retention Tower",
            "is_construction": True,
            "client_id": cls.client.id,
            "retention_percent": 10.0,
            "retention_cap_percent": 5.0,
            "date_taking_over": date(2026, 6, 30),
            "date_dlp_end": date(2027, 6, 30),
        })
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id})
        cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Superstructure",
            "quantity": 1, "unit_rate": 1000000})
        cls.boq.action_approve()          # contract 1,000,000

    def _certified_claim(self, qty=1.0):
        """A certificate that has actually withheld retention."""
        claim = self.env["construction.progress.claim"].create({
            "project_id": self.project.id, "boq_id": self.boq.id})
        claim.line_ids.qty_this_period = qty
        claim.action_submit()
        claim.action_certify()
        return claim

    def _release(self, **vals):
        return self.env["construction.retention.release"].create({
            "project_id": self.project.id,
            "date_release": date(2026, 7, 1),
            **vals,
        })

    # ------------------------------------------------------------------
    # Position
    # ------------------------------------------------------------------
    def test_the_pot_is_what_the_latest_certificate_withheld(self):
        """Retention on a claim is cumulative, so the pot is the latest
        certificate's figure — not the sum of every certificate, which would
        count the same money once per period."""
        self._certified_claim(0.5)        # 500,000 done, 5% cap -> 50,000
        second = self._certified_claim(0.5)   # 1,000,000 done -> 50,000 capped
        self.assertEqual(second.retention_cumulative, 50000)

        release = self._release()
        self.assertEqual(release.amount_withheld, 50000)
        self.assertEqual(release.amount_released_before, 0)
        self.assertEqual(release.amount_available, 50000)

    def test_the_default_is_half_of_what_is_held(self):
        self._certified_claim()
        release = self._release(release_type="taking_over")
        self.assertEqual(release.percent, 50.0)
        self.assertEqual(release.amount_release, 25000)

    def test_a_second_release_only_sees_what_is_left(self):
        self._certified_claim()
        first = self._release(release_type="taking_over")
        first.action_submit()
        first.action_approve()

        second = self._release(release_type="dlp_expiry",
                               date_release=date(2027, 7, 1))
        self.assertEqual(second.amount_released_before, 25000)
        self.assertEqual(second.amount_available, 25000)
        # 50% of what is left, not 50% of the original pot
        self.assertEqual(second.amount_release, 12500)

    def test_the_project_reports_where_the_money_is(self):
        self._certified_claim()
        self.project.invalidate_recordset()
        self.assertEqual(self.project.retention_withheld, 50000)
        self.assertEqual(self.project.retention_balance, 50000)

        release = self._release()
        release.action_submit()
        self.project.invalidate_recordset()
        self.assertEqual(self.project.retention_released, 25000)
        self.assertEqual(self.project.retention_balance, 25000)

    # ------------------------------------------------------------------
    # The ledger has to balance
    # ------------------------------------------------------------------
    def test_releasing_more_than_was_held_is_refused(self):
        self._certified_claim()
        release = self._release()
        release.amount_release = 60000        # pot is 50,000
        with self.assertRaises(UserError):
            release.action_submit()

    def test_two_releases_cannot_between_them_exceed_the_pot(self):
        """The failure that costs money: each certificate looks reasonable on
        its own and together they pay out more than was ever withheld."""
        self._certified_claim()
        first = self._release(percent=100.0)
        first.action_submit()
        first.action_approve()
        self.assertEqual(first.amount_release, 50000)

        second = self._release(release_type="dlp_expiry")
        self.assertEqual(second.amount_available, 0)
        second.amount_release = 10000
        with self.assertRaises(UserError):
            second.action_submit()

    def test_a_draft_does_not_reserve_the_money_but_a_submission_does(self):
        """Two people drafting in the same week must not each be shown the
        full balance and each release it."""
        self._certified_claim()
        drafted = self._release(percent=100.0)
        other = self._release(release_type="dlp_expiry")
        self.assertEqual(other.amount_available, 50000)   # draft reserves nothing

        drafted.action_submit()
        other.invalidate_recordset()
        other._compute_position()
        self.assertEqual(other.amount_available, 0)

    def test_a_cancelled_release_gives_the_money_back(self):
        self._certified_claim()
        first = self._release(percent=100.0)
        first.action_submit()
        first.action_cancel()

        second = self._release(release_type="dlp_expiry")
        self.assertEqual(second.amount_available, 50000)

    def test_nothing_can_be_released_before_anything_is_withheld(self):
        release = self._release()
        self.assertEqual(release.amount_available, 0)
        release.amount_release = 1000
        with self.assertRaises(UserError):
            release.action_submit()

    def test_the_guard_survives_a_direct_write(self):
        """A constraint, not a button check: an import or a server action
        must not be able to walk around it."""
        self._certified_claim()
        release = self._release()
        release.action_submit()
        with self.assertRaises(UserError):
            release.write({"amount_release": 999999})

    # ------------------------------------------------------------------
    # Dates are advisory
    # ------------------------------------------------------------------
    def test_claiming_before_the_milestone_is_flagged_not_blocked(self):
        self._certified_claim()
        early = self._release(release_type="dlp_expiry",
                              date_release=date(2026, 7, 1))   # DLP ends 2027
        self.assertTrue(early.is_early)
        self.assertIn("the end of the DLP", early.early_warning)

        early.action_submit()          # allowed: contracts get varied
        self.assertEqual(early.state, "submitted")
        self.assertTrue(any("early" in (m.body or "")
                            for m in early.message_ids))

    def test_claiming_after_the_milestone_is_not_flagged(self):
        self._certified_claim()
        on_time = self._release(release_type="taking_over",
                                date_release=date(2026, 7, 1))
        self.assertFalse(on_time.is_early)

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def test_invoicing_raises_the_money_against_the_client(self):
        self._certified_claim()
        release = self._release()
        release.action_submit()
        release.action_approve()
        release.action_create_invoice()

        self.assertEqual(release.state, "invoiced")
        self.assertEqual(release.move_id.partner_id, self.client)
        self.assertEqual(release.move_id.move_type, "out_invoice")
        self.assertEqual(
            release.move_id.amount_untaxed, release.amount_release)

    def test_an_invoiced_release_cannot_be_cancelled_behind_the_ledger(self):
        self._certified_claim()
        release = self._release()
        release.action_submit()
        release.action_approve()
        release.action_create_invoice()
        with self.assertRaises(UserError):
            release.action_cancel()

    def test_the_workflow_refuses_to_skip_steps(self):
        self._certified_claim()
        release = self._release()
        with self.assertRaises(UserError):
            release.action_approve()          # not submitted
        release.action_submit()
        with self.assertRaises(UserError):
            release.action_create_invoice()   # not approved

    def test_a_release_is_numbered_like_every_other_document(self):
        self._certified_claim()
        release = self._release()
        self.assertIn("-RRC-", release.reference)
