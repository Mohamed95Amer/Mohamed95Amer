from xml.etree import ElementTree

from odoo.tests import HttpCase, TransactionCase, tagged


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

        self.assertIn(assistant.name, {"Majal Assistant", "مساعد مجال"})
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


@tagged("post_install", "-at_install")
class TestMajalPublicRoutes(HttpCase):
    def test_database_selector_recovers_to_majal_login(self):
        response = self.url_open("/web/database/selector", timeout=15)

        self.assertIn("/web/login", response.url)
        # The live database name, not a developer's: the test database is
        # generated per run, so "erp" only ever passed by coincidence.
        self.assertIn(f"db={self.env.cr.dbname}", response.url)
        self.assertNotIn("/web/database/selector", response.url)

    def test_manifest_offers_a_maskable_icon_that_survives_the_crop(self):
        manifest = self.url_open(
            "/web/manifest.webmanifest", timeout=15
        ).json()

        by_purpose = {icon["purpose"]: icon["src"] for icon in manifest["icons"]}
        self.assertEqual(set(by_purpose), {"any", "maskable"})
        # "any maskable" on a single entry is the trap: it promises the
        # launcher it may crop, using a file drawn on the assumption it will
        # not.
        self.assertNotIn(
            "maskable", by_purpose["any"].split("/")[-1].replace(".svg", "")
        )

        maskable = self.url_open(by_purpose["maskable"], timeout=15).text
        # Parsed, not string-matched: the first version of this test looked
        # for rx="28" anywhere in the file and found it in the comment
        # explaining why it must not be in the markup.
        root = ElementTree.fromstring(maskable)
        namespace = {"svg": "http://www.w3.org/2000/svg"}

        # Full bleed. Rounded corners leave transparency that the launcher's
        # own mask turns into notches cut out of the icon.
        background = root.find("svg:rect", namespace)
        self.assertIsNotNone(background)
        self.assertIsNone(background.get("rx"))

        # And the mark scaled into the safe zone: unscaled, the ground line
        # ends 56 units from the centre and the safe radius is 51.2.
        group = root.find("svg:g", namespace)
        self.assertIsNotNone(group)
        self.assertIn("scale(0.78)", group.get("transform", ""))
