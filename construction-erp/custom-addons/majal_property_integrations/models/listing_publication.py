import base64
import hashlib
import json

from odoo import api, fields, models, tools
from odoo.exceptions import UserError, ValidationError


class MajalPropertyListingChannel(models.Model):
    _name = "majal.property.listing.channel"
    _description = "Property Listing Channel"
    _order = "company_id, name"

    name = fields.Char(required=True)
    code = fields.Char(required=True, index=True)
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="restrict", index=True)
    active = fields.Boolean(default=True)
    mode = fields.Selection(
        [("export", "Controlled Export"), ("api", "Approved API Adapter")],
        required=True, default="export")
    provider_id = fields.Many2one(
        "majal.integration.provider", ondelete="restrict",
        domain="[('service', '=', 'property_portal'), ('company_id', '=', company_id)]")
    notes = fields.Text()

    _sql_constraints = [
        ("code_company_unique", "unique(code, company_id)",
         "The channel code must be unique inside the company."),
    ]

    @api.constrains("code")
    def _check_code(self):
        for channel in self:
            if not channel.code or not channel.code.replace("-", "").replace("_", "").isalnum():
                raise ValidationError(
                    self.env._("Channel codes use letters, numbers, hyphens or underscores."))

    @api.constrains("mode", "provider_id", "company_id")
    def _check_provider(self):
        for channel in self:
            if channel.mode == "api" and not channel.provider_id:
                raise ValidationError(self.env._("API channels require an integration provider."))
            if channel.provider_id and channel.provider_id.company_id != channel.company_id:
                raise ValidationError(self.env._("The channel and provider must use the same company."))


class MajalPropertyListingPublication(models.Model):
    _name = "majal.property.listing.publication"
    _description = "Property Listing Publication"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "write_date desc, id desc"

    listing_id = fields.Many2one(
        "majal.property.listing", required=True, ondelete="cascade", index=True)
    channel_id = fields.Many2one(
        "majal.property.listing.channel", required=True, ondelete="restrict", index=True)
    company_id = fields.Many2one(
        related="listing_id.company_id", store=True, readonly=True, index=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("ready", "Ready"),
            ("queued", "Queued"),
            ("published", "Published"),
            ("failed", "Failed"),
            ("withdrawn", "Withdrawn"),
        ],
        required=True, default="draft", tracking=True, copy=False)
    snapshot = fields.Json(readonly=True, copy=False)
    checksum = fields.Char(readonly=True, copy=False, index=True)
    job_id = fields.Many2one("majal.integration.job", readonly=True, copy=False)
    external_id = fields.Char(readonly=True, copy=False)
    published_at = fields.Datetime(readonly=True, copy=False)
    last_error = fields.Text(readonly=True, copy=False)

    _sql_constraints = [
        ("listing_channel_unique", "unique(listing_id, channel_id)",
         "This listing already has a publication for this channel."),
    ]

    @api.constrains("listing_id", "channel_id")
    def _check_company(self):
        for publication in self:
            if publication.listing_id.company_id != publication.channel_id.company_id:
                raise ValidationError(
                    self.env._("The listing and channel must belong to the same company."))

    def _validate_listing(self):
        self.ensure_one()
        listing = self.listing_id
        missing = []
        if listing.state != "published":
            missing.append(self.env._("published listing status"))
        if not listing.public_title:
            missing.append(self.env._("public title"))
        if not listing.description:
            missing.append(self.env._("public description"))
        if not listing.image_1920:
            missing.append(self.env._("cover image"))
        if listing.listing_price <= 0:
            missing.append(self.env._("positive listing price"))
        if not listing.development_id.map_url:
            missing.append(self.env._("development address or coordinates"))
        if missing:
            raise UserError(
                self.env._("Complete these fields before preparing publication: %(items)s",
                           items=", ".join(missing)))

    def _build_snapshot(self):
        self.ensure_one()
        self._validate_listing()
        listing = self.listing_id
        development = listing.development_id
        image = listing.image_1920 or b""
        if isinstance(image, str):
            image = image.encode()
        try:
            image_digest = hashlib.sha256(base64.b64decode(image)).hexdigest()
        except (ValueError, TypeError):
            image_digest = hashlib.sha256(image).hexdigest()
        return {
            "schema_version": 1,
            "reference": listing.name,
            "title": {"en": listing.public_title, "ar": listing.public_title_ar or ""},
            "description": {
                "en": tools.html2plaintext(listing.description or ""),
                "ar": tools.html2plaintext(listing.description_ar or ""),
            },
            "price": {
                "amount": listing.listing_price,
                "currency": listing.currency_id.name,
            },
            "available_from": fields.Date.to_string(listing.available_from) if listing.available_from else None,
            "unit": {
                "reference": listing.unit_id.name,
                "bedrooms": listing.bedrooms,
                "bathrooms": listing.bathrooms,
                "area": listing.total_area,
                "view": listing.view or "",
                "orientation": listing.orientation or "",
                "parking": listing.parking_ref or "",
            },
            "development": {
                "name": development.name,
                "city": development.city or "",
                "country": development.country_id.name or "",
                "latitude": development.latitude or None,
                "longitude": development.longitude or None,
                "map_url": development.map_url,
            },
            "image_sha256": image_digest,
        }

    def action_prepare(self):
        for publication in self:
            snapshot = publication._build_snapshot()
            canonical = json.dumps(
                snapshot, sort_keys=True, ensure_ascii=False,
                separators=(",", ":"), default=str)
            publication.write({
                "snapshot": snapshot,
                "checksum": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
                "state": "ready",
                "job_id": False,
                "last_error": False,
            })
        return True

    def action_queue(self):
        for publication in self:
            if publication.state != "ready" or not publication.checksum:
                raise UserError(self.env._("Prepare a valid publication snapshot first."))
            channel = publication.channel_id
            if channel.mode != "api":
                raise UserError(
                    self.env._("Controlled-export channels do not make external network calls."))
            provider = channel.provider_id
            if not provider or provider.state != "active" or not provider.ready:
                raise UserError(
                    self.env._("Activate an approved, ready provider before queueing publication."))
            job = self.env["majal.integration.job"]._enqueue(
                provider,
                f"property-listing:{publication.id}:{publication.checksum}",
                "property.listing.publish",
                publication.snapshot,
                record=publication,
            )
            publication.write({"job_id": job.id, "state": "queued"})
        return True

    def action_mark_published(self):
        for publication in self:
            publication.write({
                "state": "published",
                "published_at": fields.Datetime.now(),
                "external_id": publication.job_id.external_id or publication.external_id,
                "last_error": False,
            })
        return True

    def action_withdraw(self):
        self.write({"state": "withdrawn"})
        return True


class MajalPropertyListing(models.Model):
    _inherit = "majal.property.listing"

    publication_ids = fields.One2many(
        "majal.property.listing.publication", "listing_id", string="Channel Publications")
    publication_count = fields.Integer(compute="_compute_publication_count")

    @api.depends("publication_ids")
    def _compute_publication_count(self):
        for listing in self:
            listing.publication_count = len(listing.publication_ids)

    def action_view_publications(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Channel Publications"),
            "res_model": "majal.property.listing.publication",
            "view_mode": "list,form",
            "domain": [("listing_id", "=", self.id)],
            "context": {"default_listing_id": self.id},
        }
