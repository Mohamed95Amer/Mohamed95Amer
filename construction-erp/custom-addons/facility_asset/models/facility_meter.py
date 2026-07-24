from odoo import api, fields, models


class FacilityAssetMeter(models.Model):
    _name = "facility.asset.meter"
    _description = "Asset Meter"

    name = fields.Char(required=True, help="e.g. Running Hours, kWh, Cycles.")
    equipment_id = fields.Many2one(
        "maintenance.equipment", required=True, ondelete="cascade", index=True)
    uom = fields.Char(string="Unit", help="hours / kWh / cycles …")
    reading_ids = fields.One2many("facility.asset.meter.reading", "meter_id")
    current_value = fields.Float(compute="_compute_current_value", store=True)
    last_reading_date = fields.Date(compute="_compute_current_value", store=True)

    @api.depends("reading_ids.value", "reading_ids.date")
    def _compute_current_value(self):
        for meter in self:
            latest = meter.reading_ids.sorted("date")[-1:] \
                if meter.reading_ids else meter.reading_ids
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
