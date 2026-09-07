from datetime import date

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestBaseline(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {
                "name": "Baseline Test",
                "is_construction": True,
                "date_commencement": date(2026, 1, 5),
            }
        )
        Task = cls.env["project.task"]
        cls.t1 = Task.create(
            {"name": "A", "project_id": cls.project.id, "planned_duration": 5}
        )
        cls.t2 = Task.create(
            {"name": "B", "project_id": cls.project.id, "planned_duration": 5}
        )
        cls.env["construction.task.link"].create(
            {"predecessor_id": cls.t1.id, "successor_id": cls.t2.id}
        )

    def test_reschedule_returns_notification_and_summary(self):
        action = self.project.action_reschedule()
        self.assertEqual(action["tag"], "display_notification")
        self.assertEqual(action["params"]["type"], "success")
        self.assertEqual(self.project.scheduled_start, date(2026, 1, 5))
        self.assertEqual(self.project.scheduled_finish, date(2026, 1, 16))
        self.assertEqual(self.project.schedule_duration_days, 10)
        self.assertEqual(self.project.critical_task_count, 2)
        self.assertTrue(self.project.last_rescheduled)

    def test_empty_project_notification(self):
        empty = self.env["project.project"].create(
            {"name": "Empty", "is_construction": True}
        )
        action = empty.action_reschedule()
        self.assertEqual(action["params"]["type"], "warning")

    def test_baseline_and_variance(self):
        self.project.action_reschedule()
        self.project.action_set_baseline()
        self.assertTrue(self.project.baseline_date)
        self.assertEqual(self.t2.baseline_finish, self.t2.planned_finish)
        self.assertEqual(self.t2.finish_variance_days, 0)
        # Delay A by 3 working days -> B slips 3 wd against baseline
        self.t1.planned_duration = 8
        self.project.action_reschedule()
        self.assertEqual(self.t2.finish_variance_days, 3)
        self.assertEqual(self.t1.finish_variance_days, 3)
