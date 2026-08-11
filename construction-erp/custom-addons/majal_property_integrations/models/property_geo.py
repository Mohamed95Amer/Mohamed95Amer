from urllib.parse import quote_plus

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class MajalDevelopmentGeo(models.Model):
    _inherit = "majal.development"

    street = fields.Char()
    street2 = fields.Char()
    address_state_id = fields.Many2one(
        "res.country.state",
        string="State / Emirate",
        domain="[('country_id', '=', country_id)]",
    )
    zip = fields.Char()
    latitude = fields.Float(digits=(10, 7), tracking=True)
    longitude = fields.Float(digits=(10, 7), tracking=True)
    map_url = fields.Char(compute="_compute_map_url")

    @api.depends(
        "street", "street2", "city", "address_state_id", "zip", "country_id",
        "latitude", "longitude",
    )
    def _compute_map_url(self):
        for development in self:
            if development.latitude or development.longitude:
                query = f"{development.latitude:.7f},{development.longitude:.7f}"
            else:
                query = ", ".join(filter(None, [
                    development.street,
                    development.street2,
                    development.city,
                    development.address_state_id.name,
                    development.zip,
                    development.country_id.name,
                ]))
            development.map_url = (
                "https://www.google.com/maps/search/?api=1&query=" + quote_plus(query)
                if query else False
            )

    @api.constrains("latitude", "longitude")
    def _check_coordinates(self):
        for development in self:
            if not -90 <= development.latitude <= 90:
                raise ValidationError(self.env._("Latitude must be between -90 and 90."))
            if not -180 <= development.longitude <= 180:
                raise ValidationError(self.env._("Longitude must be between -180 and 180."))

    def action_open_map(self):
        self.ensure_one()
        if not self.map_url:
            raise UserError(self.env._("Add an address or coordinates before opening the map."))
        return {
            "type": "ir.actions.act_url",
            "url": self.map_url,
            "target": "new",
        }
