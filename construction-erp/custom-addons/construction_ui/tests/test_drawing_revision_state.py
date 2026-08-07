"""The sign-off gate on drawing revisions.

construction_drawing on its own makes a new revision current immediately.
This module layers a gate on top: a revision arrives superseded and is
promoted only once it has been signed off, so an unsigned drawing never
silently becomes the one the site is building to.

The gate is only observable with this module installed, which is why the
tests live here — construction_drawing's own suite runs without it and
branches around it.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestDrawingRevisionGate(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Revision Gate", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create({
            "name": "Setting Out Plan", "number": "CI-001",
            "project_id": cls.project.id})

    def _revision(self, letter):
        return self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": letter})

    def test_a_new_revision_is_not_live_until_it_is_signed_off(self):
        rev_a = self._revision("A")
        self.assertEqual(rev_a.state, "superseded")
        self.assertEqual(rev_a.approval_state, "draft")
        self.drawing.invalidate_recordset()
        self.assertFalse(self.drawing.current_revision_id)

    def test_signing_off_makes_it_the_current_revision(self):
        rev_a = self._revision("A")
        rev_a.approval_state = "approved"
        rev_a.action_make_current()
        self.assertEqual(rev_a.state, "current")
        self.drawing.invalidate_recordset()
        self.assertEqual(self.drawing.current_revision_id, rev_a)

    def test_a_signed_off_revision_supersedes_the_one_before_it(self):
        rev_a = self._revision("A")
        rev_a.approval_state = "approved"
        rev_a.action_make_current()

        rev_b = self._revision("B")
        self.assertEqual(rev_b.state, "superseded")   # still gated
        rev_a.invalidate_recordset()
        self.assertEqual(rev_a.state, "current")      # A is still the live one

        rev_b.approval_state = "approved"
        rev_b.action_make_current()
        rev_a.invalidate_recordset()
        self.assertEqual(rev_b.state, "current")
        self.assertEqual(rev_a.state, "superseded")
        self.drawing.invalidate_recordset()
        self.assertEqual(self.drawing.current_revision_id, rev_b)
