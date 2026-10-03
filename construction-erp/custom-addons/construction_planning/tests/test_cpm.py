from datetime import date

from odoo.tests import TransactionCase, tagged

from odoo.addons.construction_planning.models import cpm


@tagged("post_install", "-at_install")
class TestCpmPrimitives(TransactionCase):
    def test_add_working_days_skips_weekend(self):
        # Friday 2026-01-09 + 1 working day = Monday 2026-01-12
        self.assertEqual(cpm.add_working_days(date(2026, 1, 9), 1), date(2026, 1, 12))
        # 0 working days snaps onto the nearest working day
        self.assertEqual(cpm.add_working_days(date(2026, 1, 10), 0), date(2026, 1, 12))

    def test_finish_from_start(self):
        # 5 working days starting Monday finishes that Friday
        self.assertEqual(
            cpm.finish_from_start(date(2026, 1, 5), 5), date(2026, 1, 9)
        )
        self.assertEqual(
            cpm.finish_from_start(date(2026, 1, 5), 0, milestone=True),
            date(2026, 1, 5),
        )

    def test_fs_chain_all_critical(self):
        tasks = {
            1: {"duration": 5, "milestone": False, "snet": None},
            2: {"duration": 5, "milestone": False, "snet": None},
        }
        links = [{"pred": 1, "succ": 2, "type": "FS", "lag": 0}]
        res = cpm.compute_schedule(tasks, links, date(2026, 1, 5))
        self.assertEqual(res[1]["early_start"], date(2026, 1, 5))
        self.assertEqual(res[1]["early_finish"], date(2026, 1, 9))
        self.assertEqual(res[2]["early_start"], date(2026, 1, 12))
        self.assertEqual(res[2]["early_finish"], date(2026, 1, 16))
        self.assertTrue(res[1]["is_critical"])
        self.assertTrue(res[2]["is_critical"])
        self.assertEqual(res[1]["total_float"], 0)

    def test_parallel_task_has_float(self):
        tasks = {
            1: {"duration": 5, "milestone": False, "snet": None},
            2: {"duration": 5, "milestone": False, "snet": None},
            3: {"duration": 2, "milestone": False, "snet": None},
        }
        links = [
            {"pred": 1, "succ": 2, "type": "FS", "lag": 0},
            {"pred": 1, "succ": 3, "type": "FS", "lag": 0},
        ]
        res = cpm.compute_schedule(tasks, links, date(2026, 1, 5))
        # T3 is off the critical path -> positive float, not critical
        self.assertFalse(res[3]["is_critical"])
        self.assertEqual(res[3]["total_float"], 3)

    def test_fs_lag_pushes_successor(self):
        tasks = {
            1: {"duration": 5, "milestone": False, "snet": None},
            2: {"duration": 5, "milestone": False, "snet": None},
        }
        links = [{"pred": 1, "succ": 2, "type": "FS", "lag": 2}]
        res = cpm.compute_schedule(tasks, links, date(2026, 1, 5))
        # finish Fri 1/9 -> +1wd = Mon 1/12 -> +2 lag = Wed 1/14
        self.assertEqual(res[2]["early_start"], date(2026, 1, 14))

    def test_milestone_zero_duration(self):
        tasks = {
            1: {"duration": 5, "milestone": False, "snet": None},
            2: {"duration": 0, "milestone": True, "snet": None},
        }
        links = [{"pred": 1, "succ": 2, "type": "FS", "lag": 0}]
        res = cpm.compute_schedule(tasks, links, date(2026, 1, 5))
        self.assertEqual(res[2]["early_start"], res[2]["early_finish"])
        self.assertEqual(res[2]["early_start"], date(2026, 1, 12))

    def test_cycle_raises(self):
        with self.assertRaises(ValueError):
            cpm.topological_order([1, 2], [(1, 2), (2, 1)])
