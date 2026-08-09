from odoo import api, fields, models


class MaintenanceEquipment(models.Model):
    _inherit = "maintenance.equipment"

    # Facilities has no notion of a customer: partner_id means vendor and
    # owner_user_id is an internal user. Once a unit is sold and let, "whose
    # air conditioner is this" has two different answers, and a technician
    # standing in the flat needs both.
    majal_unit_id = fields.Many2one(
        "majal.unit", string="Unit",
        compute="_compute_majal_unit_id", store=True, readonly=False, index=True,
        help="The saleable unit this asset sits in, taken from its location.")
    majal_development_id = fields.Many2one(
        related="majal_unit_id.development_id", store=True, readonly=True)
    majal_owner_partner_id = fields.Many2one(
        "res.partner", string="Unit Owner",
        compute="_compute_majal_parties", store=True, readonly=False)
    majal_occupant_partner_id = fields.Many2one(
        "res.partner", string="Current Occupant",
        compute="_compute_majal_parties", store=True, readonly=False,
        help="The tenant under the unit's active lease, where there is one.")

    @api.depends("facility_location_id.majal_unit_id")
    def _compute_majal_unit_id(self):
        for equipment in self:
            # Only ever assign from a location, never blank a hand-set unit —
            # the same rule as the request's own location field.
            if equipment.facility_location_id.majal_unit_id:
                equipment.majal_unit_id = equipment.facility_location_id.majal_unit_id

    @api.depends("majal_unit_id.owner_id", "majal_unit_id.tenant_id")
    def _compute_majal_parties(self):
        for equipment in self:
            unit = equipment.majal_unit_id
            if not unit:
                continue
            equipment.majal_owner_partner_id = unit.owner_id
            # Clears itself when the lease ends: an ex-tenant should not stay
            # attached to the asset in the flat they left.
            equipment.majal_occupant_partner_id = unit.tenant_id
