"""The arithmetic, on its own.

`_capacity_segments` is the one piece of this module where a quiet bug would
survive review: it is easy to write something that looks right and is only
correct when date ranges either match exactly or do not touch at all. So it is
tested apart from projects, access and everything else.
"""

from odoo.tests.common import TransactionCase


class TestCapacitySegments(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Allocation = cls.env["majal.allocation"]
        cls.employee = cls.env["hr.employee"].create(
            {"name": "Capacity Tester"})
        cls.role = cls.env.ref("majal_workforce.role_site_engineer")
        cls.other_role = cls.env.ref("majal_workforce.role_foreman")
        cls.project = cls.env["project.project"].create({
            "name": "Capacity Project",
            "is_construction": True,
            "company_id": cls.env.company.id,
        })

    def _allocate(self, start, end, percent, role=None):
        return self.Allocation.create({
            "employee_id": self.employee.id,
            "project_id": self.project.id,
            "role_id": (role or self.role).id,
            "date_start": start,
            "date_end": end,
            "allocation_percent": percent,
        })

    def test_no_allocations_is_no_segments(self):
        self.assertEqual(
            self.Allocation._capacity_segments(self.employee), [])

    def test_a_single_open_ended_allocation_runs_forever(self):
        self._allocate("2026-01-01", False, 60)
        segments = self.Allocation._capacity_segments(self.employee)
        self.assertEqual(len(segments), 1)
        start, end, total, _ids = segments[0]
        self.assertEqual(str(start), "2026-01-01")
        self.assertIsNone(end)
        self.assertEqual(total, 60)

    def test_a_partial_overlap_is_three_spans_not_one(self):
        """The case a naive sum gets wrong.

        60% all year with 80% for a single week is over-allocated for that
        week and perfectly fine either side of it. Adding the percentages of
        everything that "overlaps" would condemn the whole year; ignoring
        overlap entirely would miss the week.
        """
        self._allocate("2026-01-01", False, 60)
        self._allocate("2026-06-01", "2026-06-07", 80, role=self.other_role)

        segments = self.Allocation._capacity_segments(self.employee)
        totals = [(str(s), str(e), t) for s, e, t, _ in segments]
        self.assertEqual(totals, [
            ("2026-01-01", "2026-05-31", 60.0),
            ("2026-06-01", "2026-06-07", 140.0),
            ("2026-06-08", "None", 60.0),
        ])

    def test_touching_ranges_do_not_double_count(self):
        """One ends the day the next begins — a handover, not an overlap."""
        self._allocate("2026-01-01", "2026-03-31", 100)
        self._allocate("2026-04-01", "2026-06-30", 100, role=self.other_role)
        peaks = {
            total for _s, _e, total, _ids
            in self.Allocation._capacity_segments(self.employee)
        }
        self.assertEqual(peaks, {100.0})

    def test_over_allocation_is_reported_not_refused(self):
        """A foreman covering two towers is a real week on a real site. A
        system that refuses to record reality gets worked around."""
        first = self._allocate("2026-01-01", "2026-12-31", 80)
        second = self._allocate(
            "2026-06-01", "2026-06-30", 80, role=self.other_role)
        self.assertTrue(second.is_overallocated)
        first.invalidate_recordset(["is_overallocated"])
        self.assertTrue(first.is_overallocated)

    def test_an_allocation_that_fits_is_not_flagged(self):
        first = self._allocate("2026-01-01", "2026-12-31", 50)
        second = self._allocate(
            "2026-06-01", "2026-06-30", 50, role=self.other_role)
        self.assertFalse(second.is_overallocated)
        first.invalidate_recordset(["is_overallocated"])
        self.assertFalse(first.is_overallocated)
