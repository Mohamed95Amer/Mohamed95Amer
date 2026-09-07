from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPin(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Pin Test Project", "is_construction": True}
        )
        cls.drawing = cls.env["construction.drawing"].create(
            {"name": "Plan", "number": "A-01", "project_id": cls.project.id}
        )
        cls.revision = cls.env["construction.drawing.revision"].create(
            {"drawing_id": cls.drawing.id, "revision": "A"}
        )

    def test_coordinate_constraint(self):
        with self.assertRaises(ValidationError):
            self.env["construction.pin"].create(
                {
                    "name": "bad",
                    "revision_id": self.revision.id,
                    "pos_x": 1.5,
                    "pos_y": 0.2,
                    "pin_type": "note",
                }
            )

    def test_create_task_pin_creates_task(self):
        pin_data = self.env["construction.pin"].create_pin_with_target(
            self.revision.id, 0.5, 0.5, "task", "Fix crack at C3"
        )
        pin = self.env["construction.pin"].browse(pin_data["id"])
        self.assertEqual(pin.pin_type, "task")
        self.assertTrue(pin.task_id)
        self.assertEqual(pin.task_id.name, "Fix crack at C3")
        self.assertEqual(pin.task_id.project_id, self.project)
        self.assertEqual(pin.project_id, self.project)

    def test_create_rfi_pin_creates_rfi(self):
        pin_data = self.env["construction.pin"].create_pin_with_target(
            self.revision.id, 0.3, 0.4, "rfi", "Clarify detail", "Which spec?"
        )
        pin = self.env["construction.pin"].browse(pin_data["id"])
        self.assertTrue(pin.rfi_id)
        self.assertEqual(pin.rfi_id.project_id, self.project)

    def test_get_plan_data(self):
        self.env["construction.pin"].create(
            {
                "name": "note",
                "revision_id": self.revision.id,
                "pos_x": 0.1,
                "pos_y": 0.1,
                "pin_type": "note",
            }
        )
        data = self.env["construction.pin"].get_plan_data(self.revision.id)
        self.assertEqual(data["sheet"]["id"], self.revision.id)
        self.assertEqual(len(data["pins"]), 1)
        self.assertTrue(
            any(r["id"] == self.revision.id for r in data["sheets"])
        )

    def test_status_color_for_rfi_pin(self):
        rfi = self.env["construction.rfi"].create(
            {
                "name": "Q",
                "project_id": self.project.id,
                "question": "<p>?</p>",
            }
        )
        pin = self.env["construction.pin"].create(
            {
                "name": "rfi pin",
                "revision_id": self.revision.id,
                "pos_x": 0.2,
                "pos_y": 0.2,
                "pin_type": "rfi",
                "rfi_id": rfi.id,
            }
        )
        self.assertTrue(pin.status)
        self.assertEqual(pin.task_id.id, False)

    def test_open_target_action(self):
        pin_data = self.env["construction.pin"].create_pin_with_target(
            self.revision.id, 0.5, 0.5, "task", "T"
        )
        pin = self.env["construction.pin"].browse(pin_data["id"])
        action = pin.action_open_target()
        self.assertEqual(action["res_model"], "project.task")
        self.assertEqual(action["res_id"], pin.task_id.id)

    def test_pin_count_on_task(self):
        pin_data = self.env["construction.pin"].create_pin_with_target(
            self.revision.id, 0.5, 0.5, "task", "T"
        )
        pin = self.env["construction.pin"].browse(pin_data["id"])
        self.assertEqual(pin.task_id.pin_count, 1)
