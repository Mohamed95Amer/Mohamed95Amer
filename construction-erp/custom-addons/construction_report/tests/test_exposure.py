from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestCommercialExposure(TransactionCase):
    """What the company is exposed to, rather than how busy it is.

    Every figure already existed on some record; none of them were ever on the
    same screen, so the answer took a morning and a spreadsheet.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.project = cls.env["project.project"].create({
            "name": "Exposure Tower", "is_construction": True,
            "project_code": "EXP", "contract_value": 1000000.0,
            "construction_stage": "execution",
        })
        cls.boq = cls.env["construction.boq"].create(
            {"name": "Bill", "project_id": cls.project.id})
        cls.env["construction.boq.line"].create({
            "name": "Concrete", "boq_id": cls.boq.id,
            "quantity": 1000.0, "unit_rate": 1000.0,
        })

    def _row(self):
        payload = self.env["construction.exposure"].exposure()
        return next(row for row in payload["projects"]
                    if row["id"] == self.project.id)

    def test_a_project_with_no_activity_shows_its_contract_and_nothing_else(self):
        row = self._row()
        self.assertEqual(row["contract"], 1000000.0)
        self.assertEqual(row["variations"], 0.0)
        self.assertEqual(row["retention"], 0.0)
        self.assertEqual(row["variation_percent"], 0.0)

    def test_approved_variations_are_counted_against_the_contract(self):
        variation = self.env["construction.change.order"].create({
            "name": "Facade upgrade", "project_id": self.project.id,
            "boq_id": self.boq.id, "change_type": "addition",
            "line_ids": [(0, 0, {"name": "Cladding", "quantity": 1,
                                 "unit_rate": 150000.0})],
        })
        variation.action_submit()
        variation.action_approve()

        row = self._row()
        self.assertEqual(row["variations"], 150000.0)
        self.assertEqual(row["variation_percent"], 15.0)

    def test_a_submitted_variation_is_reported_separately(self):
        """Exposure already taken and exposure about to arrive are different
        questions, and a board asks both."""
        variation = self.env["construction.change.order"].create({
            "name": "Extra parking", "project_id": self.project.id,
            "boq_id": self.boq.id, "change_type": "addition",
            "line_ids": [(0, 0, {"name": "Slab", "quantity": 1,
                                 "unit_rate": 90000.0})],
        })
        variation.action_submit()

        row = self._row()
        self.assertEqual(row["variations"], 0.0)
        self.assertEqual(row["variations_pending"], 90000.0)

    def test_a_closed_project_drops_out(self):
        """A board asks about live exposure; a finished job is history."""
        self.project.construction_stage = "closed"
        payload = self.env["construction.exposure"].exposure()
        self.assertNotIn(
            self.project.id, [row["id"] for row in payload["projects"]])

    def test_the_totals_are_the_sum_of_the_rows(self):
        payload = self.env["construction.exposure"].exposure()
        self.assertEqual(
            payload["totals"]["contract"],
            sum(row["contract"] for row in payload["projects"]))
        self.assertEqual(payload["totals"]["projects"],
                         len(payload["projects"]))

    def test_what_is_waiting_for_a_signature_is_listed_worst_first(self):
        """The one thing on the screen anybody can act on this afternoon."""
        rule = self.env["construction.approval.rule"].create({
            "name": "Variations",
            "model_id": self.env["ir.model"]._get_id("construction.change.order"),
            "step_ids": [(0, 0, {
                "name": "Board",
                "group_id": self.env.ref(
                    "construction_base.group_construction_manager").id})],
        })
        self.assertTrue(rule)
        for value in (20000.0, 300000.0):
            variation = self.env["construction.change.order"].create({
                "name": f"Variation {value:.0f}", "project_id": self.project.id,
                "boq_id": self.boq.id, "change_type": "addition",
                "line_ids": [(0, 0, {"name": "Work", "quantity": 1,
                                     "unit_rate": value})],
            })
            variation.action_submit()
            variation.action_request_approval()

        awaiting = self.env["construction.exposure"].exposure()["awaiting"]

        self.assertGreaterEqual(len(awaiting), 2)
        amounts = [row["amount"] for row in awaiting]
        self.assertEqual(amounts, sorted(amounts, reverse=True))
