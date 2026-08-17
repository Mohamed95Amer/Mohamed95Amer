from odoo import api, fields, models


class MajalCommunity(models.Model):
    """An optional grouping layer between a development and its buildings,
    for master-planned developments with distinct sub-areas. A building may
    belong to a development directly without going through a community."""

    _name = "majal.community"
    _description = "Real Estate Community"
    _order = "name"

    name = fields.Char(required=True)
    development_id = fields.Many2one(
        "majal.development", required=True, ondelete="restrict", index=True)
    company_id = fields.Many2one(related="development_id.company_id", store=True)
    description = fields.Text()

    building_ids = fields.One2many("majal.building", "community_id", string="Buildings")
    building_count = fields.Integer(compute="_compute_building_count")

    @api.depends("building_ids")
    def _compute_building_count(self):
        for community in self:
            community.building_count = len(community.building_ids)
