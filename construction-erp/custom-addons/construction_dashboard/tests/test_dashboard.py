from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionDashboard(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.dashboard = cls.env["construction.dashboard"]
        cls.p1 = cls._build_project("Dash A", contract=1000, cost=700)
        cls.p2 = cls._build_project("Dash B", contract=2000, cost=1600)

    @classmethod
    def _build_project(cls, name, contract, cost):
        project = cls.env["project.project"].create(
            {"name": name, "is_construction": True}
        )
        boq = cls.env["construction.boq"].create({"project_id": project.id})
        cls.env["construction.boq.line"].create({
            "boq_id": boq.id, "name": "Works", "quantity": 1,
            "unit_rate": contract, "cost_material": cost,
        })
        boq.action_approve()
        return project

    def _rows(self):
        data = self.dashboard.get_dashboard_data()
        return {r["name"]: r for r in data["projects"]}, data

    def test_every_construction_project_is_reported(self):
        rows, _ = self._rows()
        self.assertIn("Dash A", rows)
        self.assertIn("Dash B", rows)

    def test_project_row_carries_the_cvr_figures(self):
        rows, _ = self._rows()
        self.assertEqual(rows["Dash A"]["contract_value"], 1000)
        self.assertEqual(rows["Dash A"]["budget_cost"], 700)
        self.assertEqual(rows["Dash A"]["forecast_margin"], 300)

    def test_portfolio_totals_sum_the_projects(self):
        _, data = self._rows()
        portfolio = data["portfolio"]
        self.assertGreaterEqual(portfolio["contract_value"], 3000)
        self.assertGreaterEqual(portfolio["projects"], 2)

    def test_portfolio_rates_are_rederived_not_averaged(self):
        """Averaging two projects' percentages is only right when they are the
        same size; the portfolio rate has to come from its own components."""
        _, data = self._rows()
        portfolio = data["portfolio"]
        contract = portfolio["contract_value"]
        expected = (portfolio["forecast_margin"] / contract * 100) if contract else 0
        self.assertAlmostEqual(
            portfolio["forecast_margin_percent"], expected, places=6)

    def test_filtering_to_one_project_narrows_the_result(self):
        data = self.dashboard.get_dashboard_data(project_ids=[self.p1.id])
        self.assertEqual(len(data["projects"]), 1)
        self.assertEqual(data["projects"][0]["name"], "Dash A")

    def test_metric_definitions_declare_direction(self):
        """The client colours by meaning, so every metric must say which way
        is good."""
        for metric in self.dashboard.get_metric_defs():
            self.assertIn(metric["better"], ("high", "low"))
            self.assertTrue(metric["label"])
