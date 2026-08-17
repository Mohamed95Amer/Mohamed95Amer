from odoo.exceptions import ValidationError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged("post_install", "-at_install")
class TestPropertyListing(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.unit = cls.env.ref("majal_real_estate.demo_unit_a1604")
        cls.sold_unit = cls.env.ref("majal_real_estate.demo_unit_b0901")
        cls.Listing = cls.env["majal.property.listing"]

    def test_listing_can_publish_available_unit(self):
        listing = self.Listing.create({
            "name": "Test listing",
            "unit_id": self.unit.id,
            "public_title": "Test title",
            "listing_price": 100000,
        })
        listing.action_submit()
        listing.action_publish()
        self.assertEqual(listing.state, "published")
        self.assertTrue(listing.published_date)

    def test_listing_cannot_publish_sold_unit(self):
        self.sold_unit.status = "sold"
        listing = self.Listing.create({
            "name": "Blocked listing",
            "unit_id": self.sold_unit.id,
            "public_title": "Test title",
            "listing_price": 100000,
        })
        with self.assertRaises(ValidationError):
            listing.action_publish()
