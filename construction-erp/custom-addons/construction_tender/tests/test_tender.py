from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionTender(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Not a test of approvals: the suite ships demo approval rules,
        # and leaving them on turns every fixture that approves a bill
        # or a variation into a test of the approval engine.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.project = cls.env["project.project"].create(
            {"name": "Tender Test Project", "is_construction": True}
        )
        # BOQ gives the package its budget: 10 x 1,000 cost = 10,000.
        cls.boq = cls.env["construction.boq"].create({"project_id": cls.project.id})
        cls.boq_line = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id,
            "name": "Ductwork",
            "quantity": 10,
            "unit_rate": 1500,
            "cost_material": 1000,
        })
        cls.boq.action_approve()

        cls.tender = cls.env["construction.tender"].create({
            "name": "HVAC package",
            "project_id": cls.project.id,
            "trade": "HVAC",
            "boq_id": cls.boq.id,
        })
        cls.line = cls.env["construction.tender.line"].create({
            "tender_id": cls.tender.id,
            "boq_line_id": cls.boq_line.id,
            "name": "Ductwork",
            "quantity": 10,
        })
        cls.bidder_a = cls.env["res.partner"].create(
            {"name": "Bidder A", "is_company": True})
        cls.bidder_b = cls.env["res.partner"].create(
            {"name": "Bidder B", "is_company": True})

    def _bid(self, bidder, rate=None):
        bid = self.env["construction.tender.bid"].create({
            "tender_id": self.tender.id,
            "bidder_id": bidder.id,
        })
        if rate is not None:
            self.env["construction.tender.bid.line"].create({
                "bid_id": bid.id,
                "tender_line_id": self.line.id,
                "unit_rate": rate,
            })
        return bid

    def test_budget_comes_from_the_boq_cost(self):
        self.assertEqual(self.line.budget_cost, 10000)
        self.assertEqual(self.tender.budget_cost, 10000)

    def test_issue_requires_scope_and_bidders(self):
        bare = self.env["construction.tender"].create(
            {"name": "Empty", "project_id": self.project.id}
        )
        with self.assertRaises(UserError):
            bare.action_issue()   # no scope lines

        self.env["construction.tender.line"].create(
            {"tender_id": bare.id, "name": "x", "quantity": 1}
        )
        with self.assertRaises(UserError):
            bare.action_issue()   # still no bidders

    def test_issuing_invites_the_draft_bids(self):
        bid = self._bid(self.bidder_a, rate=900)
        self.assertEqual(bid.state, "draft")
        self.tender.action_issue()
        self.assertEqual(self.tender.state, "issued")
        self.assertEqual(bid.state, "invited")

    def test_bid_totals_and_variance(self):
        bid = self._bid(self.bidder_a, rate=900)   # 10 x 900 = 9,000
        self.assertEqual(bid.amount_total, 9000)
        self.assertEqual(bid.variance_vs_budget, -1000)   # under budget
        self.assertTrue(bid.is_complete)

    def test_unpriced_lines_make_a_bid_incomplete(self):
        """A blank line is scope the bidder has not offered, not a free line —
        the difference between the cheapest bid and the one that blows up."""
        extra = self.env["construction.tender.line"].create({
            "tender_id": self.tender.id, "name": "Controls", "quantity": 1,
        })
        bid = self._bid(self.bidder_a, rate=900)
        self.assertEqual(bid.unpriced_line_count, 1)
        self.assertFalse(bid.is_complete)

        self.env["construction.tender.bid.line"].create({
            "bid_id": bid.id, "tender_line_id": extra.id, "unit_rate": 500,
        })
        self.assertEqual(bid.unpriced_line_count, 0)
        self.assertTrue(bid.is_complete)

    def test_load_scope_creates_a_line_per_scope_item(self):
        self.env["construction.tender.line"].create({
            "tender_id": self.tender.id, "name": "Controls", "quantity": 1,
        })
        bid = self._bid(self.bidder_a)
        bid.action_load_scope()
        self.assertEqual(len(bid.line_ids), 2)
        # Idempotent: a second load must not duplicate.
        bid.action_load_scope()
        self.assertEqual(len(bid.line_ids), 2)

    def test_leveling_needs_a_submitted_bid(self):
        bid = self._bid(self.bidder_a, rate=900)
        self.tender.action_issue()
        with self.assertRaises(UserError):
            self.tender.action_start_leveling()
        bid.action_submit()
        self.tender.action_start_leveling()
        self.assertEqual(self.tender.state, "leveling")

    def test_lowest_and_highest_track_submitted_bids(self):
        low = self._bid(self.bidder_a, rate=900)     # 9,000
        high = self._bid(self.bidder_b, rate=1200)   # 12,000
        self.tender.action_issue()
        low.action_submit()
        high.action_submit()
        self.assertEqual(self.tender.lowest_bid, 9000)
        self.assertEqual(self.tender.highest_bid, 12000)

    def _issued_with_bids(self):
        low = self._bid(self.bidder_a, rate=900)
        high = self._bid(self.bidder_b, rate=1200)
        self.tender.action_issue()
        low.action_submit()
        high.action_submit()
        return low, high

    def test_award_creates_the_subcontract(self):
        """The award is where a price becomes a commitment, so it must land in
        a subcontract — that is what the CVR counts as committed cost."""
        low, _high = self._issued_with_bids()
        low.action_award()

        subcontract = self.tender.subcontract_id
        self.assertTrue(subcontract)
        self.assertEqual(subcontract.subcontractor_id, self.bidder_a)
        self.assertEqual(subcontract.amount_total, 9000)
        self.assertEqual(subcontract.project_id, self.project)
        self.assertEqual(subcontract.line_ids.boq_line_id, self.boq_line)
        self.assertEqual(self.tender.state, "awarded")
        self.assertEqual(low.state, "awarded")

    def test_award_moves_the_projects_committed_cost(self):
        """The award has to reach the CVR. A subcontract left in draft is not
        counted as committed, so awarding a package without confirming it would
        leave the commercial position understating what has been signed away."""
        # Tendering does not depend on the reporting module, so only assert the
        # CVR side when it happens to be installed.
        has_cvr = "cvr_committed_cost" in self.project._fields
        before = self.project.cvr_committed_cost if has_cvr else 0

        low, _high = self._issued_with_bids()
        low.action_award()

        self.assertEqual(self.tender.subcontract_id.state, "confirmed")
        if has_cvr:
            self.project.invalidate_recordset(["cvr_committed_cost"])
            self.assertEqual(self.project.cvr_committed_cost, before + 9000)

    def test_award_rejects_the_other_bidders(self):
        low, high = self._issued_with_bids()
        low.action_award()
        self.assertEqual(high.state, "rejected")

    def test_award_saving_against_budget(self):
        low, _ = self._issued_with_bids()
        low.action_award()
        # 10,000 budget less 9,000 awarded.
        self.assertEqual(self.tender.award_saving, 1000)

    def test_over_budget_award_shows_a_negative_saving(self):
        _low, high = self._issued_with_bids()
        high.action_award()
        self.assertEqual(self.tender.award_saving, -2000)

    def test_a_package_cannot_be_awarded_twice(self):
        low, high = self._issued_with_bids()
        low.action_award()
        high.state = "submitted"   # force a second attempt
        with self.assertRaises(UserError):
            high.action_award()

    def test_unsubmitted_bid_cannot_be_awarded(self):
        bid = self._bid(self.bidder_a, rate=900)
        self.tender.action_issue()
        self.assertEqual(bid.state, "invited")
        with self.assertRaises(UserError):
            bid.action_award()

    def test_pull_boq_lines_builds_the_scope(self):
        tender = self.env["construction.tender"].create({
            "name": "From BOQ",
            "project_id": self.project.id,
            "boq_id": self.boq.id,
        })
        tender.action_pull_boq_lines()
        self.assertEqual(len(tender.line_ids), len(self.boq.line_ids))
        self.assertEqual(tender.line_ids.boq_line_id, self.boq_line)
        self.assertEqual(tender.budget_cost, 10000)

    def test_late_bid_is_flagged(self):
        self.tender.closing_date = "2020-01-01 00:00:00"
        bid = self._bid(self.bidder_a, rate=900)
        self.tender.action_issue()
        bid.action_submit()
        self.assertTrue(bid.is_late)

    def test_same_bidder_cannot_be_invited_twice(self):
        from psycopg2 import IntegrityError
        from odoo.tools import mute_logger

        self._bid(self.bidder_a, rate=900)
        with mute_logger("odoo.sql_db"), self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self._bid(self.bidder_a, rate=800)
