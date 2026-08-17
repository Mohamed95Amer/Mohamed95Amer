from odoo import api, fields, models


class MajalFloor(models.Model):
    _name = "majal.floor"
    _description = "Real Estate Floor"
    _order = "building_id, number"

    name = fields.Char(
        required=True,
        help='E.g. "Floor 12", "Ground", "P1" for a parking level.')
    number = fields.Integer(
        required=True,
        help="Numeric level used for ordering and for unit-code generation. "
             "Basement/parking levels may be negative.")
    building_id = fields.Many2one(
        "majal.building", required=True, ondelete="cascade", index=True)
    development_id = fields.Many2one(
        related="building_id.development_id", store=True, readonly=True)
    company_id = fields.Many2one(related="building_id.company_id", store=True)

    unit_ids = fields.One2many("majal.unit", "floor_id", string="Units")
    unit_count = fields.Integer(compute="_compute_unit_count")

    _sql_constraints = [
        ("number_building_uniq", "unique(number, building_id)",
         "This floor number already exists in this building."),
    ]

    @api.depends("unit_ids")
    def _compute_unit_count(self):
        for floor in self:
            floor.unit_count = len(floor.unit_ids)

    @api.depends("name", "building_id.name")
    def _compute_display_name(self):
        for floor in self:
            floor.display_name = f"{floor.building_id.name} / {floor.name}"
