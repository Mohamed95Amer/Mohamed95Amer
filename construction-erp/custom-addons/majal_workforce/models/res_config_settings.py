from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    majal_allocation_grace_days = fields.Integer(
        string="Keep access for (days after an allocation ends)",
        default=7,
        config_parameter="majal_workforce.grace_days",
        help="A leaving date is rarely the day the handover finishes. Access "
             "is kept for this many days after an allocation ends, so an "
             "ordinary departure is not a cliff.",
    )
