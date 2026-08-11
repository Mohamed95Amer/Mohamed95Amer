from odoo import api, fields, models
from odoo.exceptions import ValidationError


class MajalPropertyListing(models.Model):
    _name = "majal.property.listing"
    _description = "Majal Property Listing"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "featured desc, write_date desc, id desc"
    _sql_constraints = [
        ("unit_unique", "unique(unit_id)", "Each unit can have one active listing."),
    ]

    name = fields.Char(required=True, tracking=True)
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="restrict", index=True, tracking=True)
    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True)
    company_id = fields.Many2one(
        related="unit_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(
        related="unit_id.currency_id", store=True, readonly=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("review", "Pending Review"),
            ("published", "Published"),
            ("paused", "Paused"),
            ("archived", "Archived"),
        ],
        default="draft",
        required=True,
        tracking=True,
    )
    active = fields.Boolean(default=True)
    featured = fields.Boolean(string="Featured", tracking=True)
    published_date = fields.Datetime(readonly=True, copy=False)

    public_title = fields.Char(string="Public Title", required=True)
    public_title_ar = fields.Char(string="Public Title (Arabic)")
    description = fields.Html(sanitize=True)
    description_ar = fields.Html(string="Description (Arabic)", sanitize=True)
    image_1920 = fields.Image(string="Cover Image", max_width=1920, max_height=1920)

    listing_price = fields.Monetary(required=True, tracking=True)
    original_price = fields.Monetary(string="Original Price")
    available_from = fields.Date()
    energy_rating = fields.Selection(
        [(letter, letter) for letter in ("A", "B", "C", "D", "E", "F", "G")])
    public_url = fields.Char(string="Public URL")
    notes = fields.Text()

    bedrooms = fields.Integer(related="unit_id.bedrooms", store=True, readonly=True)
    bathrooms = fields.Integer(related="unit_id.bathrooms", store=True, readonly=True)
    total_area = fields.Float(related="unit_id.total_area", store=True, readonly=True)
    view = fields.Char(related="unit_id.view", store=True, readonly=True)
    orientation = fields.Char(related="unit_id.orientation", store=True, readonly=True)
    parking_ref = fields.Char(related="unit_id.parking_ref", store=True, readonly=True)

    @api.constrains("listing_price", "original_price")
    def _check_prices(self):
        for listing in self:
            if listing.listing_price < 0 or listing.original_price < 0:
                raise ValidationError("Listing prices cannot be negative.")
            if listing.original_price and listing.listing_price > listing.original_price:
                raise ValidationError("Listing price cannot exceed the original price.")

    @api.constrains("unit_id", "state")
    def _check_publishable_unit(self):
        for listing in self:
            if listing.state == "published" and listing.unit_id.status in {
                "blocked", "sold", "under_contract", "handed_over", "owner_occupied",
                "leased", "under_maintenance",
            }:
                raise ValidationError(
                    "Only planned, available or vacant units can be published.")

    def action_submit(self):
        self.write({"state": "review"})
        return True

    def action_publish(self):
        for listing in self:
            listing._check_publishable_unit()
            if not listing.public_title or not listing.listing_price:
                raise ValidationError("A public title and listing price are required.")
            listing.write({
                "state": "published",
                "published_date": fields.Datetime.now(),
            })
        return True

    def action_pause(self):
        self.write({"state": "paused"})
        return True

    def action_archive(self):
        self.write({"state": "archived", "active": False})
        return True

    def action_reset(self):
        self.write({"state": "draft", "active": True})
        return True
