from odoo import api, fields, models

from .majal_unit_type import UNIT_CATEGORY_SELECTION

# Deliberately the full lifecycle vocabulary from planning through
# operations, even though phase 1 has no workflow actions that move a unit
# between them -- the sales/leasing/handover phases land on top of this
# field, they do not need to redefine it.
UNIT_STATUS_SELECTION = [
    ("planned", "Planned"),
    ("available", "Available"),
    ("blocked", "Blocked"),
    ("reserved", "Reserved"),
    ("sold", "Sold"),
    ("under_contract", "Under Contract"),
    ("handover_due", "Handover Due"),
    ("handed_over", "Handed Over"),
    ("owner_occupied", "Owner Occupied"),
    ("leased", "Leased"),
    ("vacant", "Vacant"),
    ("under_maintenance", "Under Maintenance"),
]


class MajalUnit(models.Model):
    _name = "majal.unit"
    _description = "Real Estate Unit"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "building_id, floor_id, name"

    name = fields.Char(
        required=True, tracking=True, help='Unit code, e.g. "A-1204".')
    active = fields.Boolean(default=True)
    floor_id = fields.Many2one(
        "majal.floor", required=True, ondelete="restrict", index=True)
    # Related+stored so a development or a building can hold a real
    # One2many to its units without every view having to join through
    # floor, and so list views can group/filter on them directly.
    building_id = fields.Many2one(
        related="floor_id.building_id", store=True, readonly=True, index=True)
    development_id = fields.Many2one(
        related="floor_id.building_id.development_id", store=True, readonly=True, index=True)
    community_id = fields.Many2one(
        related="floor_id.building_id.community_id", store=True, readonly=True)
    company_id = fields.Many2one(related="floor_id.company_id", store=True)
    currency_id = fields.Many2one(related="development_id.currency_id", store=True)

    unit_type_id = fields.Many2one("majal.unit.type", ondelete="set null", tracking=True)
    unit_category = fields.Selection(UNIT_CATEGORY_SELECTION, tracking=True)
    status = fields.Selection(
        UNIT_STATUS_SELECTION, default="planned", required=True, tracking=True)

    bedrooms = fields.Integer()
    bathrooms = fields.Integer()
    suite_area = fields.Float(string="Suite Area (sqft)")
    balcony_area = fields.Float(string="Balcony Area (sqft)")
    total_area = fields.Float(
        string="Total Area (sqft)", compute="_compute_total_area", store=True)

    view = fields.Char(string="View", help='E.g. "Marina", "Garden".')
    orientation = fields.Char(help='E.g. "NW".')
    parking_ref = fields.Char(string="Parking", help='E.g. "P2-144".')

    list_price = fields.Monetary(tracking=True)
    price_per_sqft = fields.Monetary(compute="_compute_price_per_sqft", store=True)

    reservation_ids = fields.One2many("majal.reservation", "unit_id", string="Reservations")
    reservation_count = fields.Integer(compute="_compute_reservation_fields")
    active_reservation_id = fields.Many2one(
        "majal.reservation", compute="_compute_reservation_fields",
        string="Current Hold",
        help="The confirmed reservation currently holding this unit, if any.")

    _sql_constraints = [
        ("name_building_uniq", "unique(name, building_id)",
         "This unit code already exists in this building."),
    ]

    @api.depends("suite_area", "balcony_area")
    def _compute_total_area(self):
        for unit in self:
            unit.total_area = unit.suite_area + unit.balcony_area

    @api.depends("list_price", "total_area")
    def _compute_price_per_sqft(self):
        for unit in self:
            unit.price_per_sqft = (
                unit.list_price / unit.total_area if unit.total_area else 0.0)

    @api.depends("reservation_ids", "reservation_ids.state")
    def _compute_reservation_fields(self):
        for unit in self:
            reservations = unit.reservation_ids
            unit.reservation_count = len(reservations)
            unit.active_reservation_id = reservations.filtered(
                lambda r: r.state == "confirmed")[:1]

    def action_view_reservations(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Reservations",
            "res_model": "majal.reservation",
            "view_mode": "list,form",
            "domain": [("unit_id", "=", self.id)],
            "context": {"default_unit_id": self.id},
        }

    @api.onchange("unit_type_id")
    def _onchange_unit_type_id(self):
        for unit in self:
            if not unit.unit_type_id:
                continue
            unit_type = unit.unit_type_id
            unit.unit_category = unit_type.unit_category
            unit.bedrooms = unit_type.bedrooms
            unit.bathrooms = unit_type.bathrooms
            unit.suite_area = unit_type.suite_area
            unit.balcony_area = unit_type.balcony_area
            unit.list_price = unit_type.typical_price
