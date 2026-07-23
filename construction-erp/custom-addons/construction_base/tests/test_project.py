from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionProject(TransactionCase):
    def test_project_code_assigned(self):
        project = self.env["project.project"].create(
            {"name": "Test Tower", "is_construction": True}
        )
        self.assertTrue(project.project_code)
        self.assertTrue(project.project_code.startswith("PRJ"))

    def test_non_construction_project_gets_no_code(self):
        project = self.env["project.project"].create({"name": "Internal IT"})
        self.assertFalse(project.project_code)

    def test_default_stage_and_retention(self):
        project = self.env["project.project"].create(
            {"name": "Test Villa", "is_construction": True}
        )
        self.assertEqual(project.construction_stage, "tender")
        self.assertEqual(project.retention_percent, 10.0)
