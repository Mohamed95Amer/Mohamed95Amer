from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("at_install", "-post_install")
class TestMajalPropertyIntegrations(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create({
            "name": "Integration Heights",
            "code": "IH",
            "company_id": cls.env.company.id,
            "city": "Dubai",
            "country_id": cls.env.ref("base.ae").id,
            "street": "1 Test Boulevard",
        })
        building = cls.env["majal.building"].create({
            "name": "Tower A", "code": "A", "development_id": cls.development.id,
        })
        floor = cls.env["majal.floor"].create({
            "name": "Floor 1", "number": 1, "building_id": building.id,
        })
        cls.unit = cls.env["majal.unit"].create({
            "name": "A-101", "floor_id": floor.id, "status": "available",
            "bedrooms": 2, "bathrooms": 2, "suite_area": 1000,
            "list_price": 1200000,
        })
        cls.listing = cls.env["majal.property.listing"].create({
            "name": "A-101 Launch",
            "unit_id": cls.unit.id,
            "public_title": "Two-bedroom home in Integration Heights",
            "description": "<p>Bright home with a tested, controlled listing workflow.</p>",
            "listing_price": 1200000,
            "image_1920": (
                b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
                b"AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            ),
        })
        cls.listing.action_submit()
        cls.listing.action_publish()
        cls.channel = cls.env["majal.property.listing.channel"].create({
            "name": "Controlled Portal Export",
            "code": "test-controlled-export",
            "company_id": cls.env.company.id,
            "mode": "export",
        })

    def test_map_url_needs_no_provider_key(self):
        self.assertIn("google.com/maps/search", self.development.map_url)
        self.assertIn("Dubai", self.development.map_url)
        action = self.development.action_open_map()
        self.assertEqual(action["target"], "new")
        with self.assertRaises(ValidationError):
            self.development.latitude = 91

    def test_listing_snapshot_is_stable_and_export_does_not_call_network(self):
        publication = self.env["majal.property.listing.publication"].create({
            "listing_id": self.listing.id,
            "channel_id": self.channel.id,
        })
        publication.action_prepare()
        first_checksum = publication.checksum
        publication.action_prepare()
        self.assertEqual(publication.checksum, first_checksum)
        self.assertEqual(publication.state, "ready")
        self.assertEqual(publication.snapshot["unit"]["reference"], "A-101")
        with self.assertRaises(UserError):
            publication.action_queue()

    def test_reminders_are_idempotent_and_email_is_off_by_default(self):
        partner = self.env["res.partner"].create({
            "name": "Test Buyer", "email": "buyer@example.invalid",
        })
        reservation = self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": partner.id,
            "sale_price": 1200000,
            "reservation_fee": 10000,
            "expiry_date": fields.Date.add(fields.Date.context_today(self.env.user), days=2),
        })
        reservation.action_confirm()
        Settings = self.env["majal.property.notification.settings"]
        settings = Settings.search([("company_id", "=", self.env.company.id)], limit=1)
        if settings:
            settings.write({"active": True, "email_enabled": False, "reservation_days": 3})
        else:
            Settings.create({
                "company_id": self.env.company.id,
                "email_enabled": False,
                "reservation_days": 3,
            })
        Reminder = self.env["majal.property.notification"]
        Reminder._cron_generate_reminders()
        Reminder._cron_generate_reminders()
        reminders = Reminder.search([
            ("res_model", "=", reservation._name), ("res_id", "=", reservation.id),
        ])
        self.assertEqual(len(reminders), 1)
        self.assertEqual(reminders.state, "ready")
        self.assertFalse(reminders.mail_id)
