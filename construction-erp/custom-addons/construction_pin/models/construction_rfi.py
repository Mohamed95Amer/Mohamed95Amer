from odoo import fields, models


class ConstructionRfi(models.Model):
    _inherit = "construction.rfi"

    pin_ids = fields.One2many("construction.pin", "rfi_id")
    pin_count = fields.Integer(compute="_compute_pin_count")

    def _compute_pin_count(self):
        for rfi in self:
            rfi.pin_count = len(rfi.pin_ids)
