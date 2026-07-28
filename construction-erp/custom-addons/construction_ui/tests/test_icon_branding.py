from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalAppIcons(TransactionCase):
    def test_every_installed_top_level_app_uses_a_majal_icon(self):
        allowed_modules = {"construction_ui", "majal_ai"}
        top_level_apps = self.env["ir.ui.menu"].search(
            [("parent_id", "=", False), ("web_icon", "!=", False)]
        )

        unbranded = []
        for app in top_level_apps:
            icon_module = app.web_icon.split(",", 1)[0]
            if icon_module not in allowed_modules:
                unbranded.append(f"{app.name}: {app.web_icon}")

        self.assertEqual(unbranded, [])

    def test_website_and_intelligence_icons_are_unique_majal_assets(self):
        website = self.env.ref("website.menu_website_configuration")
        intelligence = self.env.ref("majal_ai.menu_ai_root")

        self.assertEqual(
            website.web_icon,
            "construction_ui,static/description/apps/website.svg",
        )
        self.assertEqual(
            intelligence.web_icon,
            "construction_ui,static/description/apps/intelligence.svg",
        )
