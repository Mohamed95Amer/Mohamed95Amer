from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalApprovalStudio(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create({
            "name": "Approval Studio Project",
            "is_construction": True,
            "company_id": cls.env.company.id,
        })
        cls.rule = cls.env["construction.approval.rule"].create({
            "name": "Studio variation flow",
            "model_id": cls.env["ir.model"]._get("project.project").id,
            "project_id": cls.project.id,
            "document_kind": "variation",
            "amount_from": 10000,
            "amount_to": 100000,
            "step_ids": [(0, 0, {
                "name": "Project manager review",
                "sequence": 10,
                "group_id": cls.env.ref(
                    "construction_base.group_construction_pm"
                ).id,
            })],
        })

    def test_rule_exposes_a_reusable_scope_summary(self):
        self.assertEqual(self.rule.step_count, 1)
        self.assertIn("Project", self.rule.scope_label)
        self.assertIn("variation", self.rule.scope_label)
        self.assertIn(self.project.display_name, self.rule.scope_label)

    def test_request_exposes_progress_for_inbox_views(self):
        request = self.env["construction.approval.request"].create({
            "res_model": "project.project",
            "res_id": self.project.id,
            "record_reference": self.project.display_name,
            "project_id": self.project.id,
            "rule_id": self.rule.id,
            "step_ids": [(0, 0, {
                "name": "Project manager review",
                "sequence": 10,
                "group_id": self.env.ref(
                    "construction_base.group_construction_pm"
                ).id,
            })],
        })
        self.assertEqual(request.pending_step_count, 1)
        self.assertEqual(request.progress_percent, 0.0)

    def test_studio_action_and_menu_are_branded(self):
        action = self.env.ref(
            "majal_approval_studio.action_approval_studio_rules"
        )
        menu = self.env.ref("majal_approval_studio.menu_approval_studio")
        self.assertEqual(action.name, "Majal Approval Studio")
        self.assertEqual(action.res_model, "construction.approval.rule")
        self.assertEqual(menu.name, "Approval Studio")
