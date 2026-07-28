from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalBranding(TransactionCase):
    def test_brand_colours_accept_valid_values_and_reject_stored_noise(self):
        params = self.env["ir.config_parameter"].sudo()
        params.set_param("majal.nav_color", "#102A36")
        params.set_param("majal.primary_color", "not-a-colour")
        params.set_param("majal.accent_color", "#C59B52")

        colours = (
            self.env["res.config.settings"]
            .sudo()
            ._get_majal_brand_colours()
        )

        self.assertEqual(colours["nav"], "#102A36")
        self.assertEqual(colours["primary"], "#346D75")
        self.assertEqual(colours["accent"], "#C59B52")

    def test_system_assistant_uses_majal_identity(self):
        assistant = self.env.ref("base.partner_root")

        self.assertEqual(assistant.name, "Majal Assistant")
        self.assertTrue(assistant.image_1920)

    def test_route_a_information_replaces_promotional_about_block(self):
        view = self.env.ref(
            "majal_branding.res_config_settings_view_form_majal_branding"
        )

        self.assertIn("majal_system_information", view.arch_db)
        self.assertNotIn("mobile_apps_funnel", view.arch_db)

    def test_existing_assistant_messages_are_rebranded(self):
        assistant = self.env.ref("base.partner_root")
        message = self.env["mail.message"].create({
            "author_id": assistant.id,
            "body": "Welcome to Odoo. Ask @OdooBot for help.",
            "message_type": "comment",
        })

        self.env["mail.message"]._majal_rebrand_assistant_messages()

        self.assertNotIn("Odoo", message.body)
        self.assertIn("Majal Assistant", message.body)

    def test_assistant_help_stays_inside_majal(self):
        styles = self.env["mail.bot"]._get_style_dict()

        self.assertIn("/majal/help", str(styles["document_link_start"]))
        self.assertIn("/majal/help", str(styles["slides_link_start"]))
