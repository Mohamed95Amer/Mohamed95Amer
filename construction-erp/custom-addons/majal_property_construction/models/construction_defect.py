from odoo import api, fields, models


class ConstructionDefect(models.Model):
    _inherit = "construction.defect"

    unit_id = fields.Many2one(
        "majal.unit", string="Unit", index=True,
        help="The saleable unit this punch item was found in, where it is "
             "inside one. Site-wide items leave this empty.")
    unit_development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True)

    @api.onchange("unit_id")
    def _onchange_unit_id(self):
        for defect in self:
            if defect.unit_id and not defect.location:
                defect.location = defect.unit_id.display_name
