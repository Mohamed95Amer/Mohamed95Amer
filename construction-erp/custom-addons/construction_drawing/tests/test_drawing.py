from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestDrawing(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Drawing Test Project", "is_construction": True}
        )
        cls.drawing = cls.env["construction.drawing"].create(
            {
                "name": "Level 1 Plan",
                "number": "AR-001",
                "project_id": cls.project.id,
            }
        )

    @property
    def _approval_gated(self):
        """True when a sign-off layer (construction_ui) is installed, which
        holds new revisions as superseded until they are signed off."""
        return "approval_state" in self.env["construction.drawing.revision"]._fields

    def _publish(self, revision):
        """Publish a revision as current, clearing the sign-off gate first when
        one is installed. Keeps these tests about supersede semantics rather
        than about which approval layer happens to be present."""
        if self._approval_gated:
            revision.approval_state = "approved"
        revision.action_make_current()

    def _new_revision(self, letter):
        return self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": letter}
        )

    def test_new_revision_supersedes_previous(self):
        rev_a = self._new_revision("A")
        if self._approval_gated:
            # Unsigned revisions must not silently become the current drawing.
            self.assertEqual(rev_a.state, "superseded")
            self.assertFalse(self.drawing.current_revision_id)
            self._publish(rev_a)
        self.assertEqual(self.drawing.current_revision_id, rev_a)

        rev_b = self._new_revision("B")
        if self._approval_gated:
            self._publish(rev_b)
        self.assertEqual(rev_a.state, "superseded")
        self.assertEqual(rev_b.state, "current")
        self.assertEqual(self.drawing.current_revision_id, rev_b)

    def test_make_current_rolls_back(self):
        rev_a = self._new_revision("A")
        rev_b = self._new_revision("B")
        self._publish(rev_b)
        self._publish(rev_a)
        self.assertEqual(rev_a.state, "current")
        self.assertEqual(rev_b.state, "superseded")

    def test_unsigned_revision_cannot_be_published(self):
        """The sign-off gate is the point of the approval layer: an unsigned
        revision must never become the current drawing."""
        if not self._approval_gated:
            self.skipTest("No approval layer installed")
        revision = self._new_revision("A")
        with self.assertRaises(UserError):
            revision.action_make_current()

    def test_upload_sheet_rpc(self):
        import base64

        rev = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "A"}
        )
        pdf_b64 = base64.b64encode(b"%PDF-1.4 minimal").decode()
        result = rev.upload_sheet("plan.pdf", pdf_b64)
        self.assertTrue(rev.attachment_id)
        self.assertEqual(result["attachment_id"], rev.attachment_id.id)
        self.assertEqual(rev.attachment_id.mimetype, "application/pdf")
        self.assertTrue(rev.has_sheet)
        # Replacing removes the old attachment
        old = rev.attachment_id
        rev.upload_sheet("plan_v2.pdf", pdf_b64)
        self.assertNotEqual(rev.attachment_id, old)
        self.assertFalse(old.exists())

    def test_upload_non_pdf_rejected(self):
        import base64

        from odoo.exceptions import UserError

        rev = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "A"}
        )
        with self.assertRaises(UserError):
            rev.upload_sheet("x.pdf", base64.b64encode(b"not a pdf").decode())

    def test_filename_parsing(self):
        wizard = self.env["construction.drawing.upload"].create(
            {"project_id": self.project.id}
        )
        self.assertEqual(wizard._parse_filename("AR-101_B.pdf"), ("AR-101", "B"))
        self.assertEqual(wizard._parse_filename("ST-201-R2.pdf"), ("ST-201", "2"))
        self.assertEqual(wizard._parse_filename("plain.pdf"), ("plain", "A"))
