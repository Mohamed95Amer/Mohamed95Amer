from odoo import api, fields, models


class MajalDevelopment(models.Model):
    """The top of the real-estate hierarchy: Development -> Community ->
    Building -> Floor -> Unit. A development is deliberately standalone in
    this module -- it does not reference project.project. The link to a
    construction project belongs to the handover/integration layer that
    connects Construction and Property, not to either side depending on
    the other.
    """

    _name = "majal.development"
    _description = "Real Estate Development"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "name"

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(
        required=True, tracking=True,
        help="Short code used as the unit-numbering prefix, e.g. MH.")
    active = fields.Boolean(default=True)
    developer_id = fields.Many2one("res.partner", string="Developer", tracking=True)
    state = fields.Selection(
        [
            ("planning", "Planning"),
            ("active", "Active"),
            ("on_hold", "On Hold"),
            ("completed", "Completed"),
        ],
        default="planning", required=True, tracking=True,
    )
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(
        "res.currency", related="company_id.currency_id", store=True, readonly=True)
    country_id = fields.Many2one("res.country")
    city = fields.Char()
    land_area = fields.Float(string="Land Area (sqft)")
    description = fields.Text()

    community_ids = fields.One2many("majal.community", "development_id", string="Communities")
    building_ids = fields.One2many("majal.building", "development_id", string="Buildings")
    unit_type_ids = fields.One2many("majal.unit.type", "development_id", string="Unit Types")
    # building_id/development_id on majal.unit are related+stored (via floor),
    # so they are real columns and a valid One2many inverse -- not just a
    # convenience for search, this is what lets a development or a building
    # list its units without walking through floors.
    unit_ids = fields.One2many("majal.unit", "development_id", string="Units")

    community_count = fields.Integer(compute="_compute_counts")
    building_count = fields.Integer(compute="_compute_counts")
    unit_count = fields.Integer(compute="_compute_counts")

    _sql_constraints = [
        ("code_company_uniq", "unique(code, company_id)",
         "This development code is already used by another development in this company."),
    ]

    @api.depends("community_ids", "building_ids", "unit_ids")
    def _compute_counts(self):
        for development in self:
            development.community_count = len(development.community_ids)
            development.building_count = len(development.building_ids)
            development.unit_count = len(development.unit_ids)

    def action_view_buildings(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Buildings",
            "res_model": "majal.building",
            "view_mode": "list,form",
            "domain": [("development_id", "=", self.id)],
            "context": {"default_development_id": self.id},
        }

    def action_view_units(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": "Units",
            "res_model": "majal.unit",
            "view_mode": "list,form",
            "domain": [("development_id", "=", self.id)],
        }
