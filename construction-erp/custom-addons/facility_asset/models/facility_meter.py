from odoo import api, fields, models


class FacilityAssetMeter(models.Model):
    """A meter's definition, tracked; its readings are not.

    Changing a meter's unit reinterprets every reading ever taken against
    it — a meter-triggered PM plan set to fire every 2000 hours starts
    firing every 2000 kWh — and nothing else records that it happened.
    The readings themselves are high-volume and already carry who and
    when on the row, so they stay chatter-free.
    """

    _name = "facility.asset.meter"
    _description = "Asset Meter"
    _inherit = ["mail.thread"]

    name = fields.Char(required=True, tracking=True,
                       help="e.g. Running Hours, kWh, Cycles.")
    equipment_id = fields.Many2one(
        "maintenance.equipment", required=True, ondelete="cascade", index=True,
        tracking=True)
    uom = fields.Char(string="Unit", tracking=True,
                      help="hours / kWh / cycles …")
    reading_ids = fields.One2many("facility.asset.meter.reading", "meter_id")
    current_value = fields.Float(compute="_compute_current_value", store=True)
    last_reading_date = fields.Date(compute="_compute_current_value", store=True)

    @api.depends("reading_ids.value", "reading_ids.date")
    def _compute_current_value(self):
        for meter in self:
            # Sort by (date, id) so multiple readings on the same day resolve
            # to the most recently entered value.
            latest = meter.reading_ids.sorted(
                lambda r: (r.date or fields.Date.today(), r.id))[-1:]
            meter.current_value = latest.value if latest else 0.0
            meter.last_reading_date = latest.date if latest else False


class FacilityAssetMeterReading(models.Model):
    _name = "facility.asset.meter.reading"
    _description = "Asset Meter Reading"
    _order = "date desc, id desc"

    meter_id = fields.Many2one(
        "facility.asset.meter", required=True, ondelete="cascade", index=True)
    date = fields.Date(default=fields.Date.context_today, required=True)
    value = fields.Float(required=True)
    user_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user)
