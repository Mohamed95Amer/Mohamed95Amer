"""The analysis view must agree with the record it analyses.

A SQL view restates business logic the Python already implements, and two
implementations that disagree are worse than one that is slow — the chart
says one margin, the project form says another, and whichever a director saw
last is the one they act on.

So the view is pinned to the compute. These tests build projects through the
ORM, let project.project compute its own CVR, and assert the view returns the
same numbers. If somebody changes the margin rule in one place and not the
other, this fails rather than quietly diverging.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionReportMatchesCVR(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.partner = cls.env["res.partner"].create({"name": "Employer"})
        cls.sub_partner = cls.env["res.partner"].create({"name": "Subbie"})

    def _project(self, name="Analysis"):
        return self.env["project.project"].create({
            "name": name, "is_construction": True,
            "project_code": name[:6].upper(),
            "partner_id": self.partner.id,
        })

    def _boq(self, project, sell, cost):
        """unit_cost is computed from the three cost components, so setting
        it directly writes nothing — which is how the first version of this
        test produced a zero budget on both sides and agreed with itself."""
        boq = self.env["construction.boq"].create({
            "name": "Bill", "project_id": project.id,
            "line_ids": [(0, 0, {
                "name": "Concrete", "quantity": 1.0,
                "unit_rate": sell, "cost_material": cost,
            })],
        })
        boq.state = "approved"
        return boq

    def _claim(self, project, boq, quantity):
        claim = self.env["construction.progress.claim"].create({
            "project_id": project.id, "boq_id": boq.id})
        claim.line_ids.qty_this_period = quantity
        claim.state = "certified"
        return claim

    def _subcontract(self, project, boq, rate):
        subcontract = self.env["construction.subcontract"].create({
            "project_id": project.id,
            "subcontractor_id": self.sub_partner.id,
            "name": "Package",
            "line_ids": [(0, 0, {
                "name": "Concrete", "boq_line_id": boq.line_ids[0].id,
                "quantity": 1.0, "unit_rate": rate,
            })],
        })
        subcontract.state = "confirmed"
        return subcontract

    def _row(self, project):
        self.env.flush_all()
        rows = self.env["majal.construction.report"].search(
            [("project_id", "=", project.id)])
        self.assertEqual(len(rows), 1, "one row per construction project")
        return rows

    def _assert_matches(self, project):
        """Field by field, the view against the compute."""
        project.invalidate_recordset()
        row = self._row(project)
        for view_field, cvr_field in (
            ("contract_value", "cvr_contract_value"),
            ("budget_cost", "cvr_budget_cost"),
            ("certified_value", "cvr_certified_value"),
            ("committed_cost", "cvr_committed_cost"),
            ("cost_to_date", "cvr_cost_to_date"),
            ("uncommitted_budget", "cvr_uncommitted_budget"),
            ("earned_margin", "cvr_earned_margin"),
            ("forecast_margin", "cvr_forecast_margin"),
            ("margin_variance", "cvr_margin_variance"),
            ("percent_complete", "cvr_percent_complete"),
        ):
            self.assertAlmostEqual(
                row[view_field], project[cvr_field], places=2,
                msg=f"{view_field} != {cvr_field}")

    def test_a_bare_project_reads_zero_on_both_sides(self):
        """The empty case is worth pinning: a LEFT JOIN that drops a project
        with no bill would silently remove it from the portfolio."""
        project = self._project("Bare")
        self._assert_matches(project)
        self.assertEqual(self._row(project).contract_value, 0.0)

    def test_a_priced_job_agrees(self):
        project = self._project("Priced")
        self._boq(project, sell=1_000_000.0, cost=800_000.0)
        self._assert_matches(project)

        row = self._row(project)
        self.assertEqual(row.contract_value, 1_000_000.0)
        self.assertEqual(row.tendered_margin, 200_000.0)

    def test_certified_value_takes_the_latest_certificate_only(self):
        """Each certificate carries the cumulative figure. Summing them would
        count every earlier one again — the classic way a portfolio total
        comes out double."""
        project = self._project("Certified")
        boq = self._boq(project, sell=1_000_000.0, cost=800_000.0)

        # Lines are populated by create() from the bill, carrying the
        # previous certificate's cumulative quantity forward. Supplying
        # line_ids by hand bypasses that and leaves every certificate
        # thinking it is the first — which is how the first version of this
        # test read 250k where the register says 550k.
        first = self._claim(project, boq, 0.30)
        second = self._claim(project, boq, 0.25)
        self.assertEqual(second.previous_claim_id, first)

        self._assert_matches(project)
        row = self._row(project)
        self.assertAlmostEqual(row.certified_value, 550_000.0, places=2)

    def test_a_let_package_moves_the_forecast(self):
        """The subtle branch. Budget covered by a let package is netted off,
        so a package let above its allowance shows on the first package
        rather than only once commitments exceed the whole budget."""
        project = self._project("Let")
        boq = self._boq(project, sell=1_000_000.0, cost=800_000.0)

        self._subcontract(project, boq, rate=900_000.0)

        self._assert_matches(project)
        # Let at 900k against an 800k allowance: the job is now forecast to
        # lose 100k of its 200k tendered margin.
        row = self._row(project)
        self.assertAlmostEqual(row.forecast_margin, 100_000.0, places=2)
        self.assertAlmostEqual(row.margin_variance, -100_000.0, places=2)

    def test_cost_to_date_follows_the_latest_payment(self):
        """subcontract.amount_certified is itself unstored and resolves to the
        newest payment's cumulative figure. The view reaches through to the
        payment table by the same rule."""
        project = self._project("Paid")
        boq = self._boq(project, sell=1_000_000.0, cost=800_000.0)
        subcontract = self._subcontract(project, boq, rate=700_000.0)
        self.env["construction.subcontract.payment"].create({
            "subcontract_id": subcontract.id,
            "line_ids": [(0, 0, {
                "subcontract_line_id": subcontract.line_ids[0].id,
                "qty_this_period": 0.40,
            })],
        })

        self._assert_matches(project)

    def test_only_construction_projects_appear(self):
        """project.project holds every project in the database. A portfolio
        that quietly included the marketing team's would be wrong in a way
        nobody would question."""
        ordinary = self.env["project.project"].create({"name": "Marketing"})
        self.env.flush_all()
        rows = self.env["majal.construction.report"].search(
            [("project_id", "=", ordinary.id)])
        self.assertFalse(rows)
