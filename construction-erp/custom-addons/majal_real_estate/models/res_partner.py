from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    is_majal_broker = fields.Boolean(
        string="Real Estate Broker",
        help="Brokers can be credited on a reservation and earn commission.")
    broker_commission_rate = fields.Float(
        string="Default Commission (%)",
        help="Proposed on new reservations; can be overridden per deal.")
