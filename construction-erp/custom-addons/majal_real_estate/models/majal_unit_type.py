from odoo import api, fields, models

# Shared with majal.unit: the vocabulary a unit type template offers is
# exactly the vocabulary a generated unit can hold.
UNIT_CATEGORY_SELECTION = [
    ("studio", "Studio"),
    ("1br", "1 Bedroom"),
    ("2br", "2 Bedroom"),
    ("3br", "3 Bedroom"),
    ("4br", "4 Bedroom"),
    ("penthouse", "Penthouse"),
    ("villa", "Villa"),
    ("townhouse", "Townhouse"),
    ("retail", "Retail"),
    ("office", "Office"),
    ("warehouse", "Warehouse"),
    ("parking", "Parking"),
    ("storage", "Storage"),
    ("other", "Other"),
]


class MajalUnitType(models.Model):
    """A reusable template: define the area/layout/price once, then use the
    generation wizard to stamp out real majal.unit records from it across
    whichever floors it applies to."""

    _name = "majal.unit.type"
    _description = "Real Estate Unit Type"
    _order = "development_id, name"

    name = fields.Char(required=True, help='E.g. "1BR Type A".')
    development_id = fields.Many2one(
        "majal.development", required=True, ondelete="cascade", index=True)
    company_id = fields.Many2one(related="development_id.company_id", store=True)
    currency_id = fields.Many2one(related="development_id.currency_id", store=True)
    unit_category = fields.Selection(UNIT_CATEGORY_SELECTION, required=True, default="1br")
    bedrooms = fields.Integer()
    bathrooms = fields.Integer()
    suite_area = fields.Float(string="Suite Area (sqft)")
    balcony_area = fields.Float(string="Balcony Area (sqft)")
    total_area = fields.Float(
        string="Total Area (sqft)", compute="_compute_total_area", store=True)
    typical_price = fields.Monetary(string="Typical Price")
    finish_notes = fields.Text()

    unit_ids = fields.One2many("majal.unit", "unit_type_id", string="Units")
    unit_count = fields.Integer(compute="_compute_unit_count")

    @api.depends("suite_area", "balcony_area")
    def _compute_total_area(self):
        for unit_type in self:
            unit_type.total_area = unit_type.suite_area + unit_type.balcony_area

    @api.depends("unit_ids")
    def _compute_unit_count(self):
        for unit_type in self:
            unit_type.unit_count = len(unit_type.unit_ids)

    def action_generate_units(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Generate Units",
            "res_model": "majal.unit.generate.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {
                "default_unit_type_id": self.id,
                "default_development_id": self.development_id.id,
            },
        }

    def action_view_units(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Units",
            "res_model": "majal.unit",
            "view_mode": "list,form",
            "domain": [("unit_type_id", "=", self.id)],
        }
