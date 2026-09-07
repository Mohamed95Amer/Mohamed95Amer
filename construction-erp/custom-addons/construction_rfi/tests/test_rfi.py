from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestRfi(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.consultant = cls.env["res.partner"].create({"name": "Consultant Co"})
        cls.project = cls.env["project.project"].create(
            {
                "name": "RFI Test Project",
                "is_construction": True,
                "consultant_id": cls.consultant.id,
            }
        )
        cls.rfi = cls.env["construction.rfi"].create(
            {
                "name": "Test question",
                "project_id": cls.project.id,
                "question": "<p>What is the spec?</p>",
            }
        )

    def test_reference_generated(self):
        self.assertTrue(self.rfi.reference)
        self.assertIn("-RFI-", self.rfi.reference)

    def test_lifecycle_and_ball_in_court(self):
        self.rfi.action_submit()
        self.assertEqual(self.rfi.state, "submitted")
        # Ball defaults to project consultant on submit
        self.assertEqual(self.rfi.ball_in_court_id, self.consultant)

        with self.assertRaises(UserError):
            self.rfi.action_answer()  # no answer written yet

        self.rfi.answer = "<p>Use spec X.</p>"
        self.rfi.action_answer()
        self.assertEqual(self.rfi.state, "answered")
        # Ball flips back to the raising party
        self.assertEqual(
            self.rfi.ball_in_court_id, self.rfi.raised_by_id.partner_id
        )

        self.rfi.action_close()
        self.assertEqual(self.rfi.state, "closed")

    def test_reopen_clears_answer(self):
        self.rfi.action_submit()
        self.rfi.answer = "<p>Answer.</p>"
        self.rfi.action_answer()
        self.rfi.action_reopen()
        self.assertEqual(self.rfi.state, "submitted")
        self.assertFalse(self.rfi.answer)
        self.assertEqual(self.rfi.ball_in_court_id, self.consultant)

    def test_overdue(self):
        self.rfi.date_required = fields.Date.today() - timedelta(days=3)
        self.rfi.action_submit()
        self.assertTrue(self.rfi.is_overdue)
        self.rfi.answer = "<p>Done.</p>"
        self.rfi.action_answer()
        self.rfi.invalidate_recordset(["is_overdue"])
        self.assertFalse(self.rfi.is_overdue)

    def test_invalid_transitions(self):
        with self.assertRaises(UserError):
            self.rfi.action_close()
        with self.assertRaises(UserError):
            self.rfi.action_answer()

    def test_drawing_shows_the_rfis_that_cite_it(self):
        drawing = self.env["construction.drawing"].create({
            "name": "Ground Floor Plan", "number": "AR-101",
            "project_id": self.project.id})
        revision = self.env["construction.drawing.revision"].create(
            {"drawing_id": drawing.id, "revision": "A"})
        self.rfi.drawing_revision_ids = [(6, 0, [revision.id])]

        self.assertEqual(drawing.citing_rfi_count, 1)
        self.assertEqual(drawing.citing_rfi_ids, self.rfi)
        action = drawing.action_view_citing_rfis()
        found = self.env["construction.rfi"].search(action["domain"])
        self.assertEqual(found, self.rfi)
