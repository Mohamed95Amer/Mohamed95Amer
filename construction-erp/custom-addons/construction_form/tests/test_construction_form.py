from datetime import date

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionForm(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Inspection Test", "is_construction": True})
        cls.template = cls.env["construction.form.template"].create({
            "name": "Safety Walk", "code": "SAFE",
            "project_id": cls.project.id,
            "question_ids": [
                (0, 0, {"name": "Access clear?", "required": True}),
                (0, 0, {"name": "Observation", "answer_type": "text"}),
            ],
        })

    def test_start_submit_and_score(self):
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.template.id,
            "project_id": self.project.id,
        })
        inspection.action_start()
        self.assertEqual(len(inspection.answer_ids), 2)
        with self.assertRaises(ValidationError):
            inspection.action_submit()
        inspection.answer_ids.filtered(
            lambda a: a.question_id.required).answer_yes_no = "yes"
        inspection.action_submit()
        self.assertEqual(inspection.state, "submitted")
        self.assertEqual(inspection.score, 100.0)

    def test_recurring_generation(self):
        self.template.write({
            "recurring": True, "recurrence_interval": 1,
            "recurrence_unit": "weeks", "next_run_date": date.today(),
        })
        self.template._cron_generate_recurring_inspections()
        inspection = self.env["construction.form.inspection"].search([
            ("template_id", "=", self.template.id)])
        self.assertEqual(len(inspection), 1)
        self.assertEqual(inspection.state, "in_progress")
        self.assertGreater(self.template.next_run_date, date.today())
