from odoo import api, fields, models


class FacilityLocation(models.Model):
    _name = "facility.location"
    _description = "Facility Location"
    _parent_store = True
    _order = "complete_name"

    name = fields.Char(required=True)
    code = fields.Char()
    location_type = fields.Selection(
        [("site", "Site"), ("building", "Building"), ("floor", "Floor"),
         ("room", "Room"), ("zone", "Zone")],
        default="building", required=True)
    parent_id = fields.Many2one(
        "facility.location", string="Parent Location", ondelete="cascade",
        index=True)
    parent_path = fields.Char(index=True)
    child_ids = fields.One2many("facility.location", "parent_id")
    complete_name = fields.Char(
        compute="_compute_complete_name", recursive=True, store=True)
    company_id = fields.Many2one(
        "res.company", default=lambda self: self.env.company)
    active = fields.Boolean(default=True)
    asset_count = fields.Integer(compute="_compute_asset_count")

    @api.depends("name", "parent_id.complete_name")
    def _compute_complete_name(self):
        for loc in self:
            loc.complete_name = (
                f"{loc.parent_id.complete_name} / {loc.name}"
                if loc.parent_id else loc.name)

    def _compute_asset_count(self):
        data = self.env["maintenance.equipment"]._read_group(
            [("facility_location_id", "child_of", self.ids)],
            ["facility_location_id"], ["__count"])
        counts = {loc.id: count for loc, count in data}
        # roll up into ancestors
        for loc in self:
            loc.asset_count = self.env["maintenance.equipment"].search_count(
                [("facility_location_id", "child_of", loc.id)])

    @api.depends("complete_name")
    def _compute_display_name(self):
        for loc in self:
            loc.display_name = loc.complete_name or loc.name

    def action_view_assets(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Assets — %s", self.name),
            "res_model": "maintenance.equipment",
            "view_mode": "list,form",
            "domain": [("facility_location_id", "child_of", self.id)],
            "context": {"default_facility_location_id": self.id},
        }
