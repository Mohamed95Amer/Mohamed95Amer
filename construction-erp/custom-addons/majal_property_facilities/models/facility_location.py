from odoo import fields, models


class FacilityLocation(models.Model):
    _inherit = "facility.location"

    # Back-links, written by the mirror when a property record is published.
    # Explicit columns rather than a search, because every stamping pass and
    # every asset attribution reads them.
    majal_development_id = fields.Many2one(
        "majal.development", string="Development", readonly=True, index=True,
        ondelete="set null",
        help="Set on locations published from the property register. Blank on "
             "locations created directly in Facilities, which is what keeps "
             "them out of the property team stamping.")
    majal_building_id = fields.Many2one(
        "majal.building", string="Building", readonly=True, ondelete="set null")
    majal_unit_id = fields.Many2one(
        "majal.unit", string="Unit", readonly=True, index=True,
        ondelete="set null")
