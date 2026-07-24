from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestProjectCvr(TransactionCase):
    """The CVR is a money report — every figure is asserted against hand-worked
    numbers rather than against the code that produces them."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "CVR Test Project", "is_construction": True}
        )
        # Contract 100,000 sell / 70,000 cost -> tendered margin 30,000 (30%).
        cls.boq = cls.env["construction.boq"].create({"project_id": cls.project.id})
        cls.section = cls.env["construction.boq.section"].create(
            {"boq_id": cls.boq.id, "name": "Structure", "code": "01"}
        )
        cls.line = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id,
            "section_id": cls.section.id,
            "name": "RC works",
            "quantity": 100,
            "unit_rate": 1000,
            "cost_material": 700,
        })
        cls.boq.action_approve()

    def test_draft_boq_is_not_a_baseline(self):
        """An unapproved bill must not be reported as a commercial baseline."""
        other = self.env["project.project"].create(
            {"name": "Draft only", "is_construction": True}
        )
        boq = self.env["construction.boq"].create({"project_id": other.id})
        self.env["construction.boq.line"].create({
            "boq_id": boq.id, "name": "x", "quantity": 1, "unit_rate": 500,
        })
        self.assertFalse(other.cvr_boq_id)
        self.assertEqual(other.cvr_contract_value, 0)

    def test_value_and_cost_baseline(self):
        self.assertEqual(self.project.cvr_boq_id, self.boq)
        self.assertEqual(self.project.cvr_contract_value, 100000)
        self.assertEqual(self.project.cvr_budget_cost, 70000)
        # Nothing certified or committed yet.
        self.assertEqual(self.project.cvr_certified_value, 0)
        self.assertEqual(self.project.cvr_committed_cost, 0)
        self.assertEqual(self.project.cvr_cost_to_date, 0)
        self.assertEqual(self.project.cvr_uncommitted_budget, 70000)
        # Forecast margin is the tendered margin while nothing has moved.
        self.assertEqual(self.project.cvr_forecast_margin, 30000)
        self.assertEqual(self.project.cvr_forecast_margin_percent, 30)
        self.assertEqual(self.project.cvr_margin_variance, 0)

    def _award_subcontract(self, amount):
        subcontract = self.env["construction.subcontract"].create({
            "name": "Structure package",
            "project_id": self.project.id,
            "subcontractor_id": self.env["res.partner"].create(
                {"name": "Sub A"}).id,
        })
        self.env["construction.subcontract.line"].create({
            "subcontract_id": subcontract.id,
            "name": "RC works",
            "quantity": 1,
            "unit_rate": amount,
        })
        subcontract.action_confirm()
        return subcontract

    def test_commitment_reduces_uncommitted_budget(self):
        self._award_subcontract(50000)
        self.assertEqual(self.project.cvr_committed_cost, 50000)
        self.assertEqual(self.project.cvr_uncommitted_budget, 20000)
        # Still inside budget, so the forecast is unchanged.
        self.assertEqual(self.project.cvr_forecast_margin, 30000)
        self.assertEqual(self.project.cvr_margin_variance, 0)

    def test_overcommitment_erodes_forecast_margin(self):
        """Committing more than budget must show up as margin erosion — this is
        the whole point of running a CVR."""
        self._award_subcontract(80000)
        self.assertEqual(self.project.cvr_committed_cost, 80000)
        self.assertEqual(self.project.cvr_uncommitted_budget, -10000)
        # Expected final cost is the commitment (80k), not the budget (70k).
        self.assertEqual(self.project.cvr_forecast_margin, 20000)
        self.assertEqual(self.project.cvr_margin_variance, -10000)

    def test_draft_subcontract_is_not_committed(self):
        subcontract = self.env["construction.subcontract"].create({
            "name": "Not awarded",
            "project_id": self.project.id,
            "subcontractor_id": self.env["res.partner"].create(
                {"name": "Sub B"}).id,
        })
        self.env["construction.subcontract.line"].create({
            "subcontract_id": subcontract.id,
            "name": "x", "quantity": 1, "unit_rate": 40000,
        })
        self.assertEqual(subcontract.state, "draft")
        self.assertEqual(self.project.cvr_committed_cost, 0)

    def test_search_finds_eroding_and_overcommitted_projects(self):
        """The dashboard tiles filter on these fields, so searching them must
        work even though they are computed and unstored."""
        Project = self.env["project.project"]
        # Healthy to begin with.
        self.assertNotIn(
            self.project, Project.search([("cvr_margin_variance", "<", 0)])
        )
        self.assertNotIn(
            self.project, Project.search([("cvr_uncommitted_budget", "<", 0)])
        )

        self._award_subcontract(80000)  # commits 10k over budget
        self.assertIn(self.project, Project.search([("cvr_margin_variance", "<", 0)]))
        self.assertIn(
            self.project, Project.search([("cvr_uncommitted_budget", "<", 0)])
        )
        self.assertIn(
            self.project, Project.search([("cvr_contract_value", ">", 0)])
        )

    def test_uncertified_claim_is_not_value(self):
        """Only a consultant-certified claim counts as earned value."""
        claim = self.env["construction.progress.claim"].create({
            "project_id": self.project.id,
            "boq_id": self.boq.id,
        })
        self.assertEqual(claim.state, "draft")
        self.assertEqual(self.project.cvr_certified_value, 0)
        self.assertEqual(self.project.cvr_percent_complete, 0)
