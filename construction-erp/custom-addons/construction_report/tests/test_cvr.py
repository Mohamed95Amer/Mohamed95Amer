from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestProjectCvr(TransactionCase):
    """The CVR is a money report — every figure is asserted against hand-worked
    numbers rather than against the code that produces them."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Not a test of approvals: the suite ships demo approval rules,
        # and leaving them on turns every fixture that approves a bill
        # or a variation into a test of the approval engine.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
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

    def test_package_let_over_its_own_budget_erodes_the_forecast(self):
        """The case a CVR exists to catch: one package let above its own
        allowance, long before total commitments approach the total budget."""
        # Add a second bill item so the job is only part-let.
        second = self.env["construction.boq.line"].create({
            "boq_id": self.boq.id,
            "section_id": self.section.id,
            "name": "Finishes",
            "quantity": 100,
            "unit_rate": 1000,
            "cost_material": 700,
        })
        # Contract 200,000 / budget 140,000, of which 70,000 is the RC works.
        self.assertEqual(self.project.cvr_budget_cost, 140000)

        subcontract = self.env["construction.subcontract"].create({
            "name": "RC package",
            "project_id": self.project.id,
            "subcontractor_id": self.env["res.partner"].create(
                {"name": "Sub over"}).id,
        })
        self.env["construction.subcontract.line"].create({
            "subcontract_id": subcontract.id,
            "boq_line_id": self.line.id,      # covers the 70,000 RC budget
            "name": "RC works",
            "quantity": 1,
            "unit_rate": 85000,               # let 15,000 over
        })
        subcontract.action_confirm()

        # Total committed (85,000) is still far below total budget (140,000),
        # so the old comparison saw nothing. Cost to complete does:
        # 85,000 committed + 70,000 not yet let = 155,000 expected.
        self.assertEqual(self.project.cvr_forecast_margin, 200000 - 155000)
        self.assertEqual(self.project.cvr_margin_variance, -15000)
        self.assertTrue(second)


@tagged("post_install", "-at_install")
class TestSectionCvr(TransactionCase):
    """A project CVR says the job is losing money; the section CVR says where."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Section CVR", "is_construction": True}
        )
        cls.boq = cls.env["construction.boq"].create({"project_id": cls.project.id})
        cls.sub = cls.env["construction.boq.section"].create(
            {"boq_id": cls.boq.id, "name": "Substructure", "code": "01"}
        )
        cls.fin = cls.env["construction.boq.section"].create(
            {"boq_id": cls.boq.id, "name": "Finishes", "code": "02"}
        )
        # Substructure: 100,000 sell / 70,000 cost.
        cls.sub_line = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "section_id": cls.sub.id, "name": "Piling",
            "quantity": 100, "unit_rate": 1000, "cost_material": 700,
        })
        # Finishes: 50,000 sell / 30,000 cost.
        cls.fin_line = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "section_id": cls.fin.id, "name": "Plaster",
            "quantity": 50, "unit_rate": 1000, "cost_material": 600,
        })
        cls.boq.action_approve()

    def test_section_carries_its_own_value_and_budget(self):
        self.assertEqual(self.sub.cvr_contract_value, 100000)
        self.assertEqual(self.sub.cvr_budget_cost, 70000)
        self.assertEqual(self.fin.cvr_contract_value, 50000)
        self.assertEqual(self.sub.cvr_forecast_margin, 30000)
        self.assertEqual(self.sub.cvr_margin_variance, 0)

    def _let_package(self, boq_line, amount):
        subcontract = self.env["construction.subcontract"].create({
            "name": "Package",
            "project_id": self.project.id,
            "subcontractor_id": self.env["res.partner"].create(
                {"name": "Sub"}).id,
        })
        self.env["construction.subcontract.line"].create({
            "subcontract_id": subcontract.id,
            "boq_line_id": boq_line.id,
            "name": "works", "quantity": 1, "unit_rate": amount,
        })
        subcontract.action_confirm()
        return subcontract

    def test_erosion_is_attributed_to_the_section_that_caused_it(self):
        """The point of the report: one section bleeding must not be averaged
        away by another that is holding."""
        self._let_package(self.sub_line, 85000)   # 15,000 over its 70,000
        self.assertEqual(self.sub.cvr_committed_cost, 85000)
        self.assertEqual(self.sub.cvr_margin_variance, -15000)
        # Finishes is untouched and must still read healthy.
        self.assertEqual(self.fin.cvr_margin_variance, 0)
        self.assertEqual(self.fin.cvr_committed_cost, 0)

    def test_draft_package_is_not_committed_to_a_section(self):
        subcontract = self.env["construction.subcontract"].create({
            "name": "Not awarded",
            "project_id": self.project.id,
            "subcontractor_id": self.env["res.partner"].create(
                {"name": "Sub draft"}).id,
        })
        self.env["construction.subcontract.line"].create({
            "subcontract_id": subcontract.id,
            "boq_line_id": self.sub_line.id,
            "name": "x", "quantity": 1, "unit_rate": 90000,
        })
        self.assertEqual(self.sub.cvr_committed_cost, 0)
        self.assertEqual(self.sub.cvr_margin_variance, 0)

    def test_section_percent_certified(self):
        self.sub_line.qty_certified = 25
        self.assertAlmostEqual(self.sub.cvr_percent_complete, 25.0, places=4)
