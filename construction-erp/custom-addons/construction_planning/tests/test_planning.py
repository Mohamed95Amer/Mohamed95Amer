from datetime import date

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPlanning(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {
                "name": "Programme Test",
                "is_construction": True,
                "date_commencement": date(2026, 1, 5),  # a Monday
            }
        )
        Task = cls.env["project.task"]
        cls.t1 = Task.create(
            {"name": "A", "project_id": cls.project.id, "planned_duration": 5}
        )
        cls.t2 = Task.create(
            {"name": "B", "project_id": cls.project.id, "planned_duration": 5}
        )
        cls.t3 = Task.create(
            {"name": "C", "project_id": cls.project.id, "planned_duration": 2}
        )
        Link = cls.env["construction.task.link"]
        Link.create({"predecessor_id": cls.t1.id, "successor_id": cls.t2.id})
        Link.create({"predecessor_id": cls.t1.id, "successor_id": cls.t3.id})

    def test_reschedule_sets_schedule(self):
        self.project.action_reschedule()
        self.assertEqual(self.t1.cpm_early_start, date(2026, 1, 5))
        self.assertEqual(self.t2.cpm_early_start, date(2026, 1, 12))
        self.assertTrue(self.t1.planned_start)
        self.assertTrue(self.t2.planned_finish)

    def test_critical_path_flags(self):
        self.project.action_reschedule()
        self.assertTrue(self.t1.is_critical)
        self.assertTrue(self.t2.is_critical)
        self.assertFalse(self.t3.is_critical)
        self.assertEqual(self.t3.total_float, 3)

    def test_predecessor_task_ids_for_arrows(self):
        self.assertIn(self.t1, self.t2.predecessor_task_ids)

    def test_cycle_link_rejected(self):
        # t2 already depends on t1; linking t1 -> t2's chain back creates a cycle
        self.env["construction.task.link"].create(
            {"predecessor_id": self.t2.id, "successor_id": self.t3.id}
        )
        with self.assertRaises(ValidationError):
            self.env["construction.task.link"].create(
                {"predecessor_id": self.t3.id, "successor_id": self.t1.id}
            )

    def test_self_link_rejected(self):
        with self.assertRaises(ValidationError):
            self.env["construction.task.link"].create(
                {"predecessor_id": self.t1.id, "successor_id": self.t1.id}
            )

    def test_snet_constraint(self):
        self.t3.constraint_date = date(2026, 1, 20)
        self.project.action_reschedule()
        # SNET pushes early start to at least 2026-01-20 (a Tuesday)
        self.assertEqual(self.t3.cpm_early_start, date(2026, 1, 20))
