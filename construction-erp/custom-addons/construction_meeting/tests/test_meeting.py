from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionMeeting(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Meeting Test Project", "is_construction": True}
        )
        cls.engineer = cls.env["res.users"].create({
            "name": "Site Engineer",
            "login": "meeting.engineer@example.com",
        })

    def _meeting(self, **vals):
        values = {
            "name": "Weekly Progress Meeting",
            "project_id": self.project.id,
            "series": "Weekly Progress",
        }
        values.update(vals)
        return self.env["construction.meeting"].create(values)

    def _action(self, meeting, name, **vals):
        values = {"meeting_id": meeting.id, "name": name}
        values.update(vals)
        return self.env["construction.meeting.action"].create(values)

    # ------------------------------------------------------------------
    # Numbering and state
    # ------------------------------------------------------------------
    def test_minutes_are_numbered_per_project(self):
        meeting = self._meeting()
        self.assertTrue(meeting.reference)
        self.assertIn("MOM", meeting.reference)

    def test_only_draft_minutes_can_be_issued(self):
        meeting = self._meeting()
        meeting.action_issue()
        self.assertEqual(meeting.state, "issued")
        with self.assertRaises(UserError):
            meeting.action_issue()

    def test_closing_requires_issued_minutes(self):
        """Minutes nobody has seen cannot be closed out."""
        meeting = self._meeting()
        meeting.action_close()
        self.assertEqual(meeting.state, "draft")
        meeting.action_issue()
        meeting.action_close()
        self.assertEqual(meeting.state, "closed")

    # ------------------------------------------------------------------
    # Action items
    # ------------------------------------------------------------------
    def test_closing_an_action_stamps_the_date(self):
        meeting = self._meeting()
        action = self._action(meeting, "Chase the shop drawings")
        self.assertFalse(action.closed_date)
        action.state = "closed"
        self.assertEqual(action.closed_date, fields.Date.context_today(action))
        # Reopening it must clear the stamp, or the item looks done in reports.
        action.state = "open"
        self.assertFalse(action.closed_date)

    def test_overdue_actions_are_countable_and_searchable(self):
        meeting = self._meeting()
        today = fields.Date.context_today(meeting)
        late = self._action(
            meeting, "Late item", deadline=today - timedelta(days=3))
        self._action(meeting, "Future item", deadline=today + timedelta(days=3))
        closed_late = self._action(
            meeting, "Done late item", deadline=today - timedelta(days=5))
        closed_late.state = "closed"

        self.assertTrue(late.is_overdue)
        self.assertFalse(closed_late.is_overdue)
        found = self.env["construction.meeting.action"].search([
            ("meeting_id", "=", meeting.id), ("is_overdue", "=", True)])
        self.assertEqual(found, late)

        meeting.invalidate_recordset()
        self.assertEqual(meeting.open_action_count, 2)
        self.assertEqual(meeting.overdue_action_count, 1)

        open_action = meeting.action_view_open_actions()
        self.assertEqual(
            self.env["construction.meeting.action"].search_count(
                open_action["domain"]), 2)

        overdue_action = meeting.action_view_overdue_actions()
        found = self.env["construction.meeting.action"].search(
            overdue_action["domain"])
        self.assertEqual(found, late)

    # ------------------------------------------------------------------
    # Carry forward — the point of the module
    # ------------------------------------------------------------------
    def test_open_actions_carry_into_the_next_meeting(self):
        meeting = self._meeting()
        open_action = self._action(
            meeting, "Provide revised programme", owner_id=self.engineer.id)
        done_action = self._action(meeting, "Issue survey report")
        done_action.state = "closed"
        meeting.action_issue()

        result = meeting.action_next_meeting()
        successor = self.env["construction.meeting"].browse(result["res_id"])

        self.assertEqual(successor.previous_meeting_id, meeting)
        self.assertEqual(successor.state, "draft")
        self.assertEqual(successor.series, meeting.series)
        self.assertNotEqual(successor.reference, meeting.reference)

        self.assertEqual(len(successor.action_ids), 1)
        carried = successor.action_ids
        self.assertEqual(carried.name, open_action.name)
        self.assertEqual(carried.owner_id, self.engineer)
        # The original stays where it was raised — the minutes are a record.
        self.assertEqual(open_action.meeting_id, meeting)

    def test_carried_actions_keep_their_age(self):
        """An item reopened at every meeting must not look new. The origin and
        the carry count are what make the stale item visible."""
        first = self._meeting()
        self._action(first, "Resolve the boundary levels")
        first.action_issue()

        second = self.env["construction.meeting"].browse(
            first.action_next_meeting()["res_id"])
        carried = second.action_ids
        self.assertEqual(carried.origin_meeting_id, first)
        self.assertEqual(carried.carried_count, 1)

        second.action_issue()
        third = self.env["construction.meeting"].browse(
            second.action_next_meeting()["res_id"])
        twice_carried = third.action_ids
        self.assertEqual(twice_carried.origin_meeting_id, first,
                         "the origin must survive every move, not shift along")
        self.assertEqual(twice_carried.carried_count, 2)

    def test_attendees_carry_forward_unmarked(self):
        """The invite list repeats; attendance does not. Copying attendance
        would fake a register for a meeting that has not happened."""
        meeting = self._meeting()
        self.env["construction.meeting.attendee"].create({
            "meeting_id": meeting.id,
            "name": "Ahmed Client Rep",
            "organisation": "Client",
            "present": True,
        })
        meeting.action_issue()
        successor = self.env["construction.meeting"].browse(
            meeting.action_next_meeting()["res_id"])

        self.assertEqual(len(successor.attendee_ids), 1)
        self.assertEqual(successor.attendee_ids.name, "Ahmed Client Rep")
        self.assertFalse(successor.attendee_ids.present)

    def test_deleting_a_meeting_takes_its_actions(self):
        meeting = self._meeting()
        action = self._action(meeting, "Temporary")
        meeting.unlink()
        self.assertFalse(action.exists())
