from odoo import fields, models


class MajalApiKeyWizard(models.TransientModel):
    _name = "majal.api.key.wizard"
    _description = "New Majal API Key"

    client_id = fields.Many2one("majal.api.client", required=True, readonly=True)
    token = fields.Char(required=True, readonly=True)

