from odoo import fields, models


class FacilitySpareLine(models.Model):
    _name = "facility.spare.line"
    _description = "Asset Spare Part"

    equipment_id = fields.Many2one(
        "maintenance.equipment", required=True, ondelete="cascade", index=True)
    product_id = fields.Many2one(
        "product.product", string="Spare Part", required=True)
    min_qty = fields.Float(string="Min. Stock", default=1.0)
    note = fields.Char()
