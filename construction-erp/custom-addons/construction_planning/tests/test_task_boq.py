from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestTaskBoqLink(TransactionCase):
    """The programme measures work done, the bill measures work agreed. The
    gap between them is what the link exists to expose."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Link Test", "is_construction": True}
        )
        cls.boq = cls.env["construction.boq"].create({"project_id": cls.project.id})
        # Two items of deliberately different value, to prove weighting.
        cls.big = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Piling",
            "quantity": 100, "unit_rate": 900,      # 90,000
        })
        cls.small = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Hoarding",
            "quantity": 100, "unit_rate": 100,      # 10,000
        })
        cls.task = cls.env["project.task"].create({
            "name": "Substructure", "project_id": cls.project.id,
        })

    def test_bill_value_sums_the_linked_items(self):
        self.task.boq_line_ids = self.big + self.small
        self.assertEqual(self.task.boq_value, 100000)

    def test_certified_percentage_is_value_weighted(self):
        """A plain average of line percentages would misreport a mixed
        activity: certifying the big item is not the same as the small one."""
        self.task.boq_line_ids = self.big + self.small
        self.big.qty_certified = 50        # 50% of 90,000
        self.small.qty_certified = 0
        # 45,000 of 100,000 certified = 45%, not the 25% a flat average gives.
        self.assertAlmostEqual(self.task.boq_certified_percent, 45.0, places=4)

    def test_progress_gap_flags_optimism(self):
        self.task.boq_line_ids = self.big
        self.big.qty_certified = 40        # 40% certified
        self.task.progress = 75            # planner says 75%
        self.assertAlmostEqual(self.task.boq_progress_gap, 35.0, places=4)

    def test_gap_is_negative_when_measurement_lags(self):
        self.task.boq_line_ids = self.big
        self.big.qty_certified = 80
        self.task.progress = 60
        self.assertAlmostEqual(self.task.boq_progress_gap, -20.0, places=4)

    def test_no_linked_items_means_no_gap(self):
        self.task.progress = 50
        self.assertEqual(self.task.boq_value, 0)
        self.assertEqual(self.task.boq_certified_percent, 0)
        self.assertEqual(self.task.boq_progress_gap, 50)

    def test_bill_line_reports_its_programme_activities(self):
        other = self.env["project.task"].create(
            {"name": "Piling rig 2", "project_id": self.project.id, "progress": 30}
        )
        self.task.progress = 70
        self.big.task_ids = self.task + other
        self.assertEqual(self.big.task_count, 2)
        self.assertAlmostEqual(self.big.programme_percent, 50.0, places=4)

    def test_zero_quantity_line_does_not_divide_by_zero(self):
        zero = self.env["construction.boq.line"].create({
            "boq_id": self.boq.id, "name": "Provisional sum",
            "quantity": 0, "unit_rate": 5000,
        })
        self.task.boq_line_ids = zero
        self.assertEqual(self.task.boq_certified_percent, 0)
