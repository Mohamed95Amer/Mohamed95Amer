from datetime import date

from psycopg2 import IntegrityError
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class TestDailyLog(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Log Test", "is_construction": True}
        )

    def _log(self, day):
        return self.env["construction.daily.log"].create(
            {"project_id": self.project.id, "log_date": day}
        )

    def test_totals(self):
        log = self._log(date(2026, 3, 2))
        self.env["construction.daily.log.manpower"].create([
            {"log_id": log.id, "trade": "Steel", "headcount": 10, "hours": 9},
            {"log_id": log.id, "trade": "Concrete", "headcount": 20, "hours": 8},
        ])
        self.env["construction.daily.log.delay"].create(
            {"log_id": log.id, "cause": "Rain", "hours_lost": 3}
        )
        self.assertEqual(log.total_headcount, 30)
        self.assertEqual(log.total_labour_hours, 10 * 9 + 20 * 8)
        self.assertEqual(log.total_delay_hours, 3)

    def test_workflow(self):
        log = self._log(date(2026, 3, 3))
        log.action_submit()
        self.assertEqual(log.state, "submitted")
        log.action_approve()
        self.assertEqual(log.state, "approved")
        log.action_reset()
        self.assertEqual(log.state, "draft")

    @mute_logger("odoo.sql_db")
    def test_one_log_per_day(self):
        self._log(date(2026, 3, 4))
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self._log(date(2026, 3, 4))
