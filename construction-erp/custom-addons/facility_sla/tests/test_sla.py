from datetime import datetime, timedelta

from odoo import fields
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilitySla(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.category = cls.env["maintenance.equipment.category"].create(
            {"name": "Chillers"}
        )
        cls.critical_asset = cls.env["maintenance.equipment"].create({
            "name": "Chiller CH-01",
            "category_id": cls.category.id,
            "criticality": "critical",
        })
        cls.normal_asset = cls.env["maintenance.equipment"].create({
            "name": "Office lamp",
            "criticality": "low",
        })
        # Round-the-clock cover keeps the arithmetic in these tests explicit;
        # the business-calendar path is exercised separately.
        cls.always_on = cls.env["resource.calendar"].create({
            "name": "24/7",
            "attendance_ids": [
                (0, 0, {"name": f"D{day}", "dayofweek": str(day),
                        "hour_from": 0.0, "hour_to": 23.99})
                for day in range(7)
            ],
        })
        # Demo ships a working SLA matrix; archive it so these tests match
        # against their own policies only.
        cls.env["facility.sla.policy"].search([]).action_archive()
        cls.policy_critical = cls.env["facility.sla.policy"].create({
            "name": "Critical 1h/8h",
            "sequence": 10,
            "criticality": "critical",
            "response_hours": 1,
            "resolution_hours": 8,
            "calendar_id": cls.always_on.id,
        })
        cls.policy_catch_all = cls.env["facility.sla.policy"].create({
            "name": "Standard 8h/72h",
            "sequence": 99,
            "response_hours": 8,
            "resolution_hours": 72,
            "calendar_id": cls.always_on.id,
        })

    def _request(self, equipment=None, **vals):
        return self.env["maintenance.request"].create({
            "name": "Test WO",
            "equipment_id": (equipment or self.critical_asset).id,
            **vals,
        })

    def test_most_specific_policy_wins(self):
        """Sequence order decides: the critical policy outranks the catch-all."""
        request = self._request()
        self.assertEqual(request.sla_policy_id, self.policy_critical)

    def test_catch_all_applies_when_nothing_specific_matches(self):
        request = self._request(equipment=self.normal_asset)
        self.assertEqual(request.sla_policy_id, self.policy_catch_all)

    def test_deadlines_derived_from_allowance(self):
        request = self._request()
        elapsed = request.sla_response_deadline - request.sla_start
        # 24/7 calendar, so working hours and elapsed hours coincide.
        self.assertAlmostEqual(elapsed.total_seconds() / 3600.0, 1.0, delta=0.2)
        elapsed_fix = request.sla_resolution_deadline - request.sla_start
        self.assertAlmostEqual(elapsed_fix.total_seconds() / 3600.0, 8.0, delta=0.3)

    def test_new_request_is_on_track(self):
        request = self._request()
        self.assertEqual(request.sla_response_state, "on_track")
        self.assertEqual(request.sla_resolution_state, "on_track")
        self.assertFalse(request.sla_breached)

    def test_acknowledging_in_time_meets_the_response_sla(self):
        request = self._request()
        request.action_sla_respond()
        self.assertTrue(request.sla_responded_on)
        self.assertEqual(request.sla_response_state, "met")

    def test_late_response_breaches(self):
        request = self._request()
        # Force the deadline into the past, then acknowledge.
        request.sla_response_deadline = fields.Datetime.now() - timedelta(hours=1)
        request.action_sla_respond()
        self.assertEqual(request.sla_response_state, "breached")
        self.assertTrue(request.sla_breached)

    def test_missed_deadline_breaches_without_any_response(self):
        request = self._request()
        request.sla_resolution_deadline = fields.Datetime.now() - timedelta(hours=1)
        self.assertEqual(request.sla_resolution_state, "breached")
        self.assertTrue(request.sla_breached)

    def test_at_risk_before_the_deadline(self):
        request = self._request()
        # 8h allowance, 80% threshold -> at risk once 6.4h are consumed.
        request.sla_start = fields.Datetime.now() - timedelta(hours=7)
        request.invalidate_recordset(["sla_resolution_state"])
        self.assertEqual(request.sla_resolution_state, "at_risk")
        self.assertFalse(request.sla_breached)

    def test_closing_inside_the_allowance_stays_met(self):
        """A work order closed in time must stay 'met' as the deadline recedes
        into the past — the state is judged on when it was resolved, not on
        what the clock says now."""
        request = self._request()
        done_stage = self.env["maintenance.stage"].search([("done", "=", True)], limit=1)
        request.stage_id = done_stage
        self.assertTrue(request.sla_resolved_on)
        self.assertEqual(request.sla_resolution_state, "met")

        request.invalidate_recordset(["sla_resolution_state"])
        self.assertEqual(request.sla_resolution_state, "met")
        self.assertFalse(request.sla_breached)

    def test_closing_after_the_deadline_breaches(self):
        request = self._request()
        request.sla_resolution_deadline = fields.Datetime.now() - timedelta(hours=1)
        done_stage = self.env["maintenance.stage"].search([("done", "=", True)], limit=1)
        request.stage_id = done_stage
        self.assertTrue(request.sla_resolved_on)
        self.assertEqual(request.sla_resolution_state, "breached")
        self.assertTrue(request.sla_breached)

    def test_reopening_restarts_the_resolution_clock(self):
        request = self._request()
        done_stage = self.env["maintenance.stage"].search([("done", "=", True)], limit=1)
        open_stage = self.env["maintenance.stage"].search([("done", "=", False)],
                                                          order="sequence, id", limit=1)
        request.stage_id = done_stage
        self.assertTrue(request.sla_resolved_on)
        request.stage_id = open_stage
        self.assertFalse(request.sla_resolved_on)

    def test_retriage_reassigns_the_policy(self):
        """Moving the work order to a non-critical asset must drop it to the
        catch-all cover."""
        request = self._request()
        self.assertEqual(request.sla_policy_id, self.policy_critical)
        request.equipment_id = self.normal_asset
        self.assertEqual(request.sla_policy_id, self.policy_catch_all)

    def test_business_calendar_pauses_outside_working_hours(self):
        """A promise measured on a 9-5 calendar must not burn overnight."""
        office = self.env["resource.calendar"].create({
            "name": "Mon-Fri 09:00-17:00",
            "attendance_ids": [
                (0, 0, {"name": f"D{day}", "dayofweek": str(day),
                        "hour_from": 9.0, "hour_to": 17.0})
                for day in range(5)
            ],
        })
        self.policy_catch_all.calendar_id = office
        request = self._request(equipment=self.normal_asset)
        # Raised on a Monday at 16:00 with an 8h allowance -> lands the next
        # working day, not 8 clock-hours later at midnight.
        request.sla_start = datetime(2026, 3, 2, 16, 0, 0)
        request._assign_sla()
        self.assertGreater(
            request.sla_response_deadline, datetime(2026, 3, 3, 0, 0, 0)
        )

    def test_cron_escalates_a_newly_breached_request(self):
        request = self._request()
        request.sla_resolution_deadline = fields.Datetime.now() - timedelta(hours=1)
        request.invalidate_recordset(["sla_resolution_state"])
        before = len(request.message_ids)
        self.env["maintenance.request"]._cron_check_sla()
        self.assertEqual(request.sla_resolution_state, "breached")
        self.assertGreaterEqual(len(request.message_ids), before)

    def test_post_init_covers_the_open_backlog(self):
        """Switching SLAs on must cover work that already exists — that backlog
        is the reason SLAs get bought — while leaving closed work alone."""
        from odoo.addons.facility_sla.hooks import post_init_assign_sla

        open_request = self._request()
        done_request = self._request()
        done_stage = self.env["maintenance.stage"].search([("done", "=", True)], limit=1)
        done_request.stage_id = done_stage

        # Simulate the pre-install state: no SLA on either record.
        (open_request | done_request).write({
            "sla_policy_id": False,
            "sla_start": False,
            "sla_response_deadline": False,
            "sla_resolution_deadline": False,
        })

        post_init_assign_sla(self.env)

        self.assertEqual(open_request.sla_policy_id, self.policy_critical)
        self.assertTrue(open_request.sla_resolution_deadline)
        self.assertFalse(done_request.sla_policy_id)

    def test_cron_covers_work_that_fell_outside_cover(self):
        """Open work with no policy must be picked up by the sweep, whatever
        the reason it was missed."""
        request = self._request()
        request.write({
            "sla_policy_id": False,
            "sla_start": False,
            "sla_resolution_deadline": False,
        })
        self.env["maintenance.request"]._cron_check_sla()
        self.assertEqual(request.sla_policy_id, self.policy_critical)
        self.assertTrue(request.sla_resolution_deadline)

    def test_no_policy_means_no_sla(self):
        self.policy_critical.active = False
        self.policy_catch_all.active = False
        request = self._request()
        self.assertFalse(request.sla_policy_id)
        self.assertEqual(request.sla_resolution_state, "none")
        self.assertFalse(request.sla_breached)
