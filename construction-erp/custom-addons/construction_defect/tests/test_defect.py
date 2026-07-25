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


@tagged("post_install", "-at_install")
class TestInspectionRaisesDefects(TransactionCase):
    """The bridge that stops a failed inspection being a dead end."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "QA Bridge", "is_construction": True}
        )
        cls.template = cls.env["construction.form.template"].create({
            "name": "Pre-pour check",
            "code": "QA-BRIDGE",
            "project_id": cls.project.id,
            "question_ids": [
                (0, 0, {"name": "Rebar to drawing", "answer_type": "yes_no"}),
                (0, 0, {"name": "Formwork clean", "answer_type": "yes_no"}),
                (0, 0, {"name": "Slump", "answer_type": "number"}),
            ],
        })

    def _inspection(self, answers):
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.template.id,
            "project_id": self.project.id,
            "location": "Grid B",
        })
        inspection.action_start()
        for answer in inspection.answer_ids:
            value = answers.get(answer.question_id.name)
            if value:
                answer.answer_yes_no = value
        return inspection

    def test_failed_checks_become_defects(self):
        inspection = self._inspection(
            {"Rebar to drawing": "no", "Formwork clean": "yes"}
        )
        self.assertEqual(inspection.failed_check_count, 1)
        self.assertEqual(inspection.unraised_check_count, 1)

        inspection.action_raise_defects()
        self.assertEqual(inspection.defect_count, 1)
        defect = inspection.defect_ids
        self.assertEqual(defect.name, "Rebar to drawing")
        self.assertEqual(defect.project_id, self.project)
        self.assertEqual(defect.location, "Grid B")
        self.assertEqual(defect.inspection_id, inspection)

    def test_one_defect_per_failed_check(self):
        inspection = self._inspection(
            {"Rebar to drawing": "no", "Formwork clean": "no"}
        )
        inspection.action_raise_defects()
        self.assertEqual(inspection.defect_count, 2)

    def test_raising_twice_does_not_duplicate(self):
        """Pressing the button again must not re-raise what is already open."""
        inspection = self._inspection({"Rebar to drawing": "no"})
        inspection.action_raise_defects()
        self.assertEqual(inspection.unraised_check_count, 0)
        with self.assertRaises(UserError):
            inspection.action_raise_defects()
        self.assertEqual(inspection.defect_count, 1)

    def test_a_new_failure_can_still_be_raised(self):
        inspection = self._inspection({"Rebar to drawing": "no"})
        inspection.action_raise_defects()
        # A later check fails too; only the new one should be raised.
        inspection.answer_ids.filtered(
            lambda a: a.question_id.name == "Formwork clean"
        ).answer_yes_no = "no"
        self.assertEqual(inspection.unraised_check_count, 1)
        inspection.action_raise_defects()
        self.assertEqual(inspection.defect_count, 2)

    def test_a_passing_inspection_raises_nothing(self):
        inspection = self._inspection(
            {"Rebar to drawing": "yes", "Formwork clean": "yes"}
        )
        self.assertEqual(inspection.failed_check_count, 0)
        with self.assertRaises(UserError):
            inspection.action_raise_defects()
