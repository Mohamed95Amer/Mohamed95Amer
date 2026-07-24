from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestDefect(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Defect Test", "is_construction": True}
        )
        cls.drawing = cls.env["construction.drawing"].create(
            {"name": "P", "number": "A-1", "project_id": cls.project.id}
        )
        cls.revision = cls.env["construction.drawing.revision"].create(
            {"drawing_id": cls.drawing.id, "revision": "A"}
        )

    def _defect(self, **vals):
        return self.env["construction.defect"].create(
            {"name": "Crack", "project_id": self.project.id, **vals}
        )

    def test_reference_generated(self):
        defect = self._defect()
        self.assertIn("-DEF-", defect.reference)
        self.assertEqual(defect.state, "open")

    def test_lifecycle(self):
        defect = self._defect()
        defect.action_start()
        self.assertEqual(defect.state, "in_progress")
        defect.action_ready()
        self.assertEqual(defect.state, "ready")
        defect.action_close()
        self.assertEqual(defect.state, "closed")
        defect.action_reopen()
        self.assertEqual(defect.state, "reopened")

    def test_invalid_transition(self):
        defect = self._defect()
        with self.assertRaises(UserError):
            defect.action_close()

    def test_color_by_state(self):
        defect = self._defect()
        self.assertEqual(defect.color, 1)  # open -> red
        defect.action_start()
        self.assertEqual(defect.color, 3)  # in progress -> amber
        defect.action_ready()
        defect.action_close()
        self.assertEqual(defect.color, 10)  # closed -> green

    def test_defect_pin_type_registered(self):
        types = {
            t["id"]: t
            for t in self.env["construction.pin"]._pin_type_registry()
        }
        self.assertIn("defect", types)
        self.assertEqual(types["defect"]["model"], "construction.defect")

    def test_create_defect_pin_via_viewer(self):
        pin_data = self.env["construction.pin"].create_pin_with_target(
            self.revision.id, 0.4, 0.6, "defect", "Chipped render", "on the west wall"
        )
        pin = self.env["construction.pin"].browse(pin_data["id"])
        self.assertEqual(pin.pin_type, "defect")
        self.assertTrue(pin.defect_id)
        self.assertEqual(pin.defect_id.name, "Chipped render")
        self.assertEqual(pin.defect_id.description, "on the west wall")
        self.assertEqual(pin.status_bucket, "open")

    def test_defect_pin_status_follows_state(self):
        defect = self._defect()
        pin = self.env["construction.pin"].create(
            {
                "name": "d",
                "revision_id": self.revision.id,
                "pos_x": 0.2,
                "pos_y": 0.2,
                "pin_type": "defect",
                "defect_id": defect.id,
            }
        )
        self.assertEqual(pin.status_bucket, "open")
        defect.action_start()
        defect.action_ready()
        defect.action_close()
        pin.invalidate_recordset(["status_bucket"])
        self.assertEqual(pin.status_bucket, "done")

    def test_action_open_target(self):
        defect = self._defect()
        pin = self.env["construction.pin"].create(
            {
                "name": "d",
                "revision_id": self.revision.id,
                "pos_x": 0.2,
                "pos_y": 0.2,
                "pin_type": "defect",
                "defect_id": defect.id,
            }
        )
        action = pin.action_open_target()
        self.assertEqual(action["res_model"], "construction.defect")
        self.assertEqual(action["res_id"], defect.id)
