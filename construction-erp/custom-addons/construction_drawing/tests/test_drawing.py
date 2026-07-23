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

    def test_new_revision_supersedes_previous(self):
        rev_a = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "A"}
        )
        self.assertEqual(self.drawing.current_revision_id, rev_a)
        rev_b = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "B"}
        )
        self.assertEqual(rev_a.state, "superseded")
        self.assertEqual(rev_b.state, "current")
        self.assertEqual(self.drawing.current_revision_id, rev_b)

    def test_make_current_rolls_back(self):
        rev_a = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "A"}
        )
        rev_b = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "B"}
        )
        rev_a.action_make_current()
        self.assertEqual(rev_a.state, "current")
        self.assertEqual(rev_b.state, "superseded")

    def test_filename_parsing(self):
        wizard = self.env["construction.drawing.upload"].create(
            {"project_id": self.project.id}
        )
        self.assertEqual(wizard._parse_filename("AR-101_B.pdf"), ("AR-101", "B"))
        self.assertEqual(wizard._parse_filename("ST-201-R2.pdf"), ("ST-201", "2"))
        self.assertEqual(wizard._parse_filename("plain.pdf"), ("plain", "A"))
