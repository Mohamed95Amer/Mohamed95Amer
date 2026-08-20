from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalDashboardHub(TransactionCase):
    def test_dashboard_designer_role_has_both_editing_engines(self):
        designer = self.env.ref("construction_ui.group_dashboard_designer")
        implied = designer.trans_implied_ids
        self.assertIn(self.env.ref("spreadsheet_oca.group_manager"), implied)
        self.assertIn(
            self.env.ref("spreadsheet_dashboard.group_dashboard_manager"),
            implied,
        )

    def test_dashboard_app_opens_management_hub(self):
        """The Dashboards app must never land on an empty workbook shell."""
        menu = self.env.ref(
            "spreadsheet_dashboard.spreadsheet_dashboard_menu_root"
        )
        action = self.env.ref("construction_ui.action_majal_dashboard_hub")
        self.assertEqual(menu.action, action)
        self.assertEqual(action.tag, "construction_ui.dashboard_hub")

    def test_analytical_workbooks_remain_available(self):
        """Power users can still reach the configurable spreadsheet engine."""
        menu = self.env.ref(
            "spreadsheet_dashboard.spreadsheet_dashboard_menu_dashboard"
        )
        self.assertEqual(
            menu.action,
            self.env.ref("spreadsheet_dashboard.ir_actions_dashboard_action"),
        )
