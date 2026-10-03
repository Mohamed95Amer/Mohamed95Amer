import base64
from datetime import date

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged

from odoo.addons.construction_form.models.form_library import LIBRARY


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

    def test_progress_tracks_what_is_left(self):
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.template.id, "project_id": self.project.id})
        inspection.action_start()
        self.assertEqual(inspection.answered_count, 0)
        self.assertEqual(inspection.remaining_count, 2)
        self.assertEqual(inspection.progress, 0.0)

        inspection.answer_ids.filtered(
            lambda a: a.answer_type == "yes_no").answer_yes_no = "yes"

        self.assertEqual(inspection.answered_count, 1)
        self.assertEqual(inspection.progress, 50.0)

    def test_marking_the_rest_as_yes_leaves_answers_alone(self):
        """The shortcut fills blanks; it must not overwrite a recorded No."""
        template = self.env["construction.form.template"].create({
            "name": "Three checks", "code": "THREE",
            "project_id": self.project.id,
            "question_ids": [
                (0, 0, {"name": "One"}), (0, 0, {"name": "Two"}),
                (0, 0, {"name": "Free text", "answer_type": "text"}),
            ],
        })
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id, "project_id": self.project.id})
        inspection.action_start()
        failed = inspection.answer_ids.filtered(
            lambda a: a.question_id.name == "One")
        failed.answer_yes_no = "no"

        inspection.action_pass_remaining()

        self.assertEqual(failed.answer_yes_no, "no", "a recorded No was overwritten")
        self.assertEqual(
            inspection.answer_ids.filtered(
                lambda a: a.question_id.name == "Two").answer_yes_no, "yes")
        self.assertFalse(
            inspection.answer_ids.filtered(
                lambda a: a.answer_type == "text").answer_text,
            "there is no safe default for a free-text answer",
        )

    def test_marking_the_rest_as_yes_needs_something_to_mark(self):
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.template.id, "project_id": self.project.id})
        inspection.action_start()
        inspection.action_pass_remaining()
        with self.assertRaises(UserError):
            inspection.action_pass_remaining()

    def test_a_failed_check_is_flagged_as_failed(self):
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.template.id, "project_id": self.project.id})
        inspection.action_start()
        answer = inspection.answer_ids.filtered(
            lambda a: a.answer_type == "yes_no")
        answer.answer_yes_no = "no"
        self.assertTrue(answer.is_failed)
        self.assertTrue(answer.is_answered)

        answer.answer_yes_no = "na"
        self.assertFalse(
            answer.is_failed, "N/A is not a failure — it is a check that did not apply")

    def test_the_checklist_follows_the_order_the_questions_were_written_in(self):
        template = self.env["construction.form.template"].create({
            "name": "Ordered", "code": "ORDER", "project_id": self.project.id,
            "question_ids": [
                (0, 0, {"name": "Third", "sequence": 30}),
                (0, 0, {"name": "First", "sequence": 10}),
                (0, 0, {"name": "Second", "sequence": 20}),
            ],
        })
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id, "project_id": self.project.id})
        inspection.action_start()
        # Re-read rather than trust the cache: the one2many keeps insertion
        # order in memory, and it is the stored order a reader gets.
        inspection.invalidate_recordset()
        self.assertEqual(
            inspection.answer_ids.mapped("question_id.name"),
            ["First", "Second", "Third"],
        )

    def test_starting_a_company_wide_form_asks_which_project(self):
        """The standard forms carry no project, and must not fail because of it.

        They are deliberately company-wide — one snag sheet for every job — so
        starting one has to ask which project it is for rather than raising a
        required-field error on a field the user was never shown.
        """
        template = self.env["construction.form.template"].create(
            {"name": "Company wide", "code": "COMPANY",
             "question_ids": [(0, 0, {"name": "Check"})]})

        action = template.action_new_inspection()

        self.assertEqual(action["res_model"], "construction.form.inspection")
        self.assertEqual(action["views"], [[False, "form"]])
        self.assertEqual(action["context"]["default_template_id"], template.id)

    def test_a_schedule_needs_a_project_to_raise_against(self):
        template = self.env["construction.form.template"].create(
            {"name": "No project", "code": "NOPROJ",
             "question_ids": [(0, 0, {"name": "Check"})]})
        with self.assertRaises(ValidationError):
            template.write({"recurring": True, "next_run_date": date.today()})

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


@tagged("post_install", "-at_install")
class TestFormLibrary(TransactionCase):
    """The forms that ship with the module.

    A form builder that installs empty makes every new user write a QA system
    from scratch, which is how you end up with two forms nobody maintains.
    """

    def test_the_standard_forms_are_installed(self):
        codes = set(self.env["construction.form.template"].search([]).mapped("code"))
        for expected in ("SNAG-GEN", "QA-PREPOUR", "QA-FIRESTOP", "QA-HANDOVER"):
            self.assertIn(expected, codes, f"{expected} should ship with the module")

    def test_every_standard_form_has_questions(self):
        """An empty template is worse than no template — it looks done."""
        codes = [code for code, _name, _description, _questions in LIBRARY]
        templates = self.env["construction.form.template"].search(
            [("code", "in", codes)])
        self.assertEqual(len(templates), len(codes))
        for template in templates:
            self.assertTrue(template.question_ids, f"{template.code} has no questions")
            self.assertTrue(
                any(q.required for q in template.question_ids),
                f"{template.code} asks nothing it insists on")

    def test_every_question_declares_a_section(self):
        """Sections are what make a twenty-question form readable on a phone."""
        codes = [code for code, _name, _description, _questions in LIBRARY]
        for template in self.env["construction.form.template"].search(
                [("code", "in", codes)]):
            for question in template.question_ids:
                self.assertTrue(
                    question.section,
                    f"{template.code}: '{question.name}' has no section")

    def test_the_snag_form_can_raise_defects(self):
        """The whole point of the snag form: a failed check becomes a defect.

        The bridge that does it lives in construction_defect, which depends on
        this module rather than the other way round, so this test only has
        something to assert when that module is installed too.
        """
        if "construction.defect" not in self.env:
            self.skipTest("construction_defect is not installed")
        project = self.env["project.project"].create(
            {"name": "Snag test", "is_construction": True})
        template = self.env["construction.form.template"].search(
            [("code", "=", "SNAG-GEN")], limit=1)
        self.assertTrue(template)

        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id,
            "project_id": project.id,
        })
        inspection.action_start()

        # Answer everything the form insists on, then fail two of the checks —
        # a form cannot be submitted half-filled, which is the point of it.
        for answer in inspection.answer_ids.filtered(lambda a: a.question_id.required):
            if answer.answer_type == "yes_no":
                answer.answer_yes_no = "yes"
            elif answer.answer_type == "number":
                answer.answer_number = 1
            elif answer.answer_type == "date":
                answer.answer_date = fields.Date.context_today(answer)
            elif answer.answer_type in ("photo", "signature"):
                answer.answer_binary = base64.b64encode(b"evidence")
            else:
                answer.answer_text = "recorded"

        failed = inspection.answer_ids.filtered(
            lambda a: a.answer_type == "yes_no")[:2]
        failed.write({"answer_yes_no": "no"})
        inspection.action_submit()

        before = self.env["construction.defect"].search_count(
            [("project_id", "=", project.id)])
        inspection.action_raise_defects()
        after = self.env["construction.defect"].search_count(
            [("project_id", "=", project.id)])
        self.assertEqual(after - before, len(failed))

    def test_installing_twice_does_not_duplicate(self):
        library = self.env["construction.form.library"]
        before = self.env["construction.form.template"].search_count([])
        library._install_library()
        after = self.env["construction.form.template"].search_count([])
        self.assertEqual(before, after)

    def test_a_rewritten_form_is_not_restored(self):
        """Matching on code means an edited form stays edited.

        Re-running the installer must add what is missing, not undo what
        somebody deliberately changed.
        """
        template = self.env["construction.form.template"].search(
            [("code", "=", "HSE-WALK")], limit=1)
        self.assertTrue(template)
        template.write({"name": "Our own safety walk"})
        template.question_ids[:1].unlink()
        remaining = len(template.question_ids)

        self.env["construction.form.library"]._install_library()

        template.invalidate_recordset()
        self.assertEqual(template.name, "Our own safety walk")
        self.assertEqual(len(template.question_ids), remaining)
