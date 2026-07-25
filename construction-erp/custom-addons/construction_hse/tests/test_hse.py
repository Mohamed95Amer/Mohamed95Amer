from datetime import datetime, timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionHse(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "HSE Test Project", "is_construction": True}
        )

    # ------------------------------------------------------------------
    # Permits
    # ------------------------------------------------------------------
    def _permit(self, hours=8, **vals):
        now = fields.Datetime.now()
        permit = self.env["construction.permit"].create({
            "name": "Hot work",
            "project_id": self.project.id,
            "permit_type": "hot_work",
            "valid_from": now,
            "valid_to": now + timedelta(hours=hours),
            **vals,
        })
        self.env["construction.permit.precaution"].create([
            {"permit_id": permit.id, "name": "Fire watch", "mandatory": True},
            {"permit_id": permit.id, "name": "Gas test", "mandatory": False},
        ])
        return permit

    def test_permit_needs_precautions_before_submission(self):
        now = fields.Datetime.now()
        bare = self.env["construction.permit"].create({
            "name": "No precautions",
            "project_id": self.project.id,
            "valid_from": now,
            "valid_to": now + timedelta(hours=4),
        })
        with self.assertRaises(UserError):
            bare.action_submit()

    def test_mandatory_precautions_gate_approval(self):
        """The control the whole permit exists for: no authority until the
        mandatory precautions are confirmed."""
        permit = self._permit()
        permit.action_submit()
        with self.assertRaises(UserError):
            permit.action_approve()
        self.assertEqual(permit.state, "submitted")

        permit.precaution_ids.filtered("mandatory").checked = True
        permit.action_approve()
        self.assertEqual(permit.state, "approved")
        self.assertTrue(permit.approved_by_id)

    def test_optional_precaution_does_not_block_approval(self):
        permit = self._permit()
        permit.action_submit()
        permit.precaution_ids.filtered("mandatory").checked = True
        permit.action_approve()
        self.assertFalse(permit.precaution_ids.filtered(
            lambda p: not p.mandatory).checked)
        self.assertEqual(permit.state, "approved")

    def _approved_permit(self, hours=8):
        permit = self._permit(hours=hours)
        permit.action_submit()
        permit.precaution_ids.filtered("mandatory").checked = True
        permit.action_approve()
        return permit

    def test_work_can_only_start_under_a_live_permit(self):
        permit = self._approved_permit()
        permit.action_start_work()
        self.assertEqual(permit.state, "active")

    def test_work_cannot_start_outside_the_window(self):
        permit = self._approved_permit()
        # Push the whole window into the future.
        permit.write({
            "valid_from": fields.Datetime.now() + timedelta(days=1),
            "valid_to": fields.Datetime.now() + timedelta(days=2),
        })
        self.assertFalse(permit.is_live)
        with self.assertRaises(UserError):
            permit.action_start_work()

    def test_window_must_be_ordered(self):
        now = fields.Datetime.now()
        with self.assertRaises(UserError):
            self.env["construction.permit"].create({
                "name": "Backwards",
                "project_id": self.project.id,
                "valid_from": now,
                "valid_to": now - timedelta(hours=1),
            })

    def test_expiry_cron_pulls_down_lapsed_permits(self):
        """A lapsed permit must stop reading as authority."""
        permit = self._approved_permit()
        permit.action_start_work()
        # A lapsed permit has its whole window behind it.
        permit.write({
            "valid_from": fields.Datetime.now() - timedelta(hours=9),
            "valid_to": fields.Datetime.now() - timedelta(minutes=1),
        })

        self.env["construction.permit"]._cron_expire_permits()
        self.assertEqual(permit.state, "expired")
        self.assertFalse(permit.is_live)

    def test_closed_permit_is_not_expired_by_the_cron(self):
        permit = self._approved_permit()
        permit.action_close()
        permit.write({
            "valid_from": fields.Datetime.now() - timedelta(hours=9),
            "valid_to": fields.Datetime.now() - timedelta(minutes=1),
        })
        self.env["construction.permit"]._cron_expire_permits()
        self.assertEqual(permit.state, "closed")

    def test_live_permits_are_searchable(self):
        live = self._approved_permit()
        stale = self._approved_permit()
        stale.write({
            "valid_from": fields.Datetime.now() - timedelta(hours=9),
            "valid_to": fields.Datetime.now() - timedelta(hours=1),
        })
        found = self.env["construction.permit"].search([("is_live", "=", True)])
        self.assertIn(live, found)
        self.assertNotIn(stale, found)

    # ------------------------------------------------------------------
    # Incidents
    # ------------------------------------------------------------------
    def _incident(self, incident_class="near_miss", **vals):
        return self.env["construction.incident"].create({
            "name": "Test incident",
            "project_id": self.project.id,
            "incident_class": incident_class,
            "description": "Something happened.",
            **vals,
        })

    def test_only_lost_time_classes_count_as_lti(self):
        """Near misses, first aid and medical treatment must not inflate LTIFR."""
        self.assertFalse(self._incident("near_miss").is_lti)
        self.assertFalse(self._incident("first_aid").is_lti)
        self.assertFalse(self._incident("medical").is_lti)
        self.assertTrue(self._incident("lost_time").is_lti)
        self.assertTrue(self._incident("fatality").is_lti)

    def test_investigation_requires_a_root_cause(self):
        incident = self._incident()
        incident.action_investigate()
        self.assertEqual(incident.state, "investigating")
        with self.assertRaises(UserError):
            incident.action_record_actions()
        incident.root_cause = "Board not fixed down."
        incident.action_record_actions()
        self.assertEqual(incident.state, "actions")

    def test_incident_cannot_close_with_outstanding_actions(self):
        incident = self._incident()
        incident.action_investigate()
        incident.root_cause = "Poor housekeeping."
        incident.action_record_actions()
        action = self.env["construction.incident.action"].create(
            {"incident_id": incident.id, "name": "Re-brief the crew"}
        )
        with self.assertRaises(UserError):
            incident.action_close()

        action.done = True
        self.assertTrue(action.done_date)
        incident.action_close()
        self.assertEqual(incident.state, "closed")

    # ------------------------------------------------------------------
    # Safety statistics
    # ------------------------------------------------------------------
    def _log_hours(self, headcount, hours, day):
        log = self.env["construction.daily.log"].create(
            {"project_id": self.project.id, "log_date": day}
        )
        self.env["construction.daily.log.manpower"].create({
            "log_id": log.id, "trade": "Crew",
            "headcount": headcount, "hours": hours,
        })
        return log

    def test_manhours_come_from_the_daily_logs(self):
        self._log_hours(10, 8, "2026-03-02")   # 80
        self._log_hours(20, 9, "2026-03-03")   # 180
        self.assertEqual(self.project.hse_manhours, 260)

    def test_ltifr_is_per_million_hours(self):
        """One LTI in 50,000 hours is an LTIFR of 20."""
        self._log_hours(125, 8, "2026-03-04")   # 1,000 h
        for day in range(2, 9):
            self._log_hours(125, 8, f"2026-04-0{day}")  # 7,000 h
        self._log_hours(1000, 42, "2026-05-04")  # 42,000 h -> 50,000 total
        self.assertEqual(self.project.hse_manhours, 50000)

        self._incident("lost_time", days_lost=5)
        self.assertEqual(self.project.hse_lti_count, 1)
        self.assertEqual(self.project.hse_ltifr, 20.0)
        self.assertEqual(self.project.hse_days_lost, 5)

    def test_near_misses_do_not_move_ltifr(self):
        self._log_hours(125, 8, "2026-06-01")
        self._incident("near_miss")
        self._incident("first_aid")
        self.assertEqual(self.project.hse_near_miss_count, 1)
        self.assertEqual(self.project.hse_lti_count, 0)
        self.assertEqual(self.project.hse_ltifr, 0.0)

    def test_ltifr_is_zero_without_manhours(self):
        """No exposure recorded must not divide by zero."""
        self._incident("lost_time")
        self.assertEqual(self.project.hse_manhours, 0)
        self.assertEqual(self.project.hse_ltifr, 0.0)

    def test_days_since_last_lti(self):
        self.assertEqual(self.project.hse_days_since_lti, -1)
        self._incident(
            "lost_time",
            occurred_on=fields.Datetime.now() - timedelta(days=30),
        )
        self.assertEqual(self.project.hse_days_since_lti, 30)

    def test_live_permit_count_on_the_project(self):
        self.assertEqual(self.project.hse_live_permit_count, 0)
        self._approved_permit()
        self.assertEqual(self.project.hse_live_permit_count, 1)
