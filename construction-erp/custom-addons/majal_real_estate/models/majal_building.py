from odoo import api, fields, models
from odoo.exceptions import ValidationError


class MajalBuilding(models.Model):
    _name = "majal.building"
    _description = "Real Estate Building"
    _order = "name"

    name = fields.Char(required=True, help='E.g. "Tower A".')
    code = fields.Char(
        required=True,
        help="Short code used as the unit-numbering prefix within this "
             'building, e.g. "A".')
    development_id = fields.Many2one(
        "majal.development", required=True, ondelete="restrict", index=True)
    community_id = fields.Many2one(
        "majal.community", ondelete="restrict", index=True,
        domain="[('development_id', '=', development_id)]")
    company_id = fields.Many2one(related="development_id.company_id", store=True)
    building_type = fields.Selection(
        [
            ("tower", "Tower"),
            ("villa_block", "Villa / Townhouse Block"),
            ("retail", "Retail"),
            ("mixed_use", "Mixed Use"),
            ("clubhouse", "Clubhouse / Amenity"),
            ("parking", "Parking Structure"),
            ("other", "Other"),
        ],
        default="tower", required=True,
    )
    planned_floor_count = fields.Integer(
        string="Planned Floors",
        help="Designed floor count, which may run ahead of the floor "
             "records actually created.")

    floor_ids = fields.One2many("majal.floor", "building_id", string="Floors")
    unit_ids = fields.One2many("majal.unit", "building_id", string="Units")

    floor_count = fields.Integer(compute="_compute_counts")
    unit_count = fields.Integer(compute="_compute_counts")

    _sql_constraints = [
        ("code_development_uniq", "unique(code, development_id)",
         "This building code is already used by another building in this development."),
    ]

    @api.depends("floor_ids", "unit_ids")
    def _compute_counts(self):
        for building in self:
            building.floor_count = len(building.floor_ids)
            building.unit_count = len(building.unit_ids)

    def action_view_floors(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Floors",
            "res_model": "majal.floor",
            "view_mode": "list,form",
            "domain": [("building_id", "=", self.id)],
            "context": {"default_building_id": self.id},
        }

    def action_view_units(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Units",
            "res_model": "majal.unit",
            "view_mode": "list,form",
            "domain": [("building_id", "=", self.id)],
        }

    @api.constrains("community_id", "development_id")
    def _check_community_same_development(self):
        for building in self:
            if (building.community_id
                    and building.community_id.development_id != building.development_id):
                raise ValidationError(
                    self.env._(
                        "%(building)s's community must belong to the same "
                        "development as the building.",
                        building=building.display_name,
                    )
                )
