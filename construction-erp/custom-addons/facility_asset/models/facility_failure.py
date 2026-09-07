from odoo import api, fields, models


class FacilityFailureCode(models.Model):
    """Failure taxonomy, tracked because reporting history depends on it.

    Renaming or retyping a code silently rewrites what every historical
    work order appears to have been about, which is exactly the kind of
    change an ISO 9001 audit asks to see justified.
    """

    _name = "facility.failure.code"
    _description = "Failure Code"
    _inherit = ["mail.thread"]
    _order = "failure_type, code, name"

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(tracking=True)
    failure_type = fields.Selection(
        [("problem", "Problem"), ("cause", "Cause"), ("remedy", "Remedy")],
        default="problem", required=True, tracking=True)
    active = fields.Boolean(default=True, tracking=True)


class MaintenanceRequest(models.Model):
    _inherit = "maintenance.request"

    failure_problem_id = fields.Many2one(
        "facility.failure.code", string="Problem",
        domain="[('failure_type', '=', 'problem')]")
    failure_cause_id = fields.Many2one(
        "facility.failure.code", string="Cause",
        domain="[('failure_type', '=', 'cause')]")
    failure_remedy_id = fields.Many2one(
        "facility.failure.code", string="Remedy",
        domain="[('failure_type', '=', 'remedy')]")
    downtime_hours = fields.Float(
        help="Asset downtime attributable to this request, for availability "
        "and cost reporting.")
    # A stored *related* would be overwritten from the asset on every write,
    # which means a request with no asset could never hold a location at all.
    # That is not a corner case: every fault an occupant reports ("the AC in
    # A-1204 is dripping") arrives without equipment, and with no location it
    # is missing from location.open_request_count, from the location's own
    # work list, and from the record rules that decide which FM staff can see
    # it. A writable compute keeps the asset as the default source and still
    # lets a location be set on its own.
    facility_location_id = fields.Many2one(
        "facility.location",
        compute="_compute_facility_location_id",
        store=True, readonly=False, index=True,
    )

    @api.depends("equipment_id.facility_location_id")
    def _compute_facility_location_id(self):
        for request in self:
            # Only ever assign *from* an asset. Writing False when there is no
            # equipment would wipe a hand-set location on every recompute and
            # put us straight back where we started.
            if request.equipment_id:
                request.facility_location_id = request.equipment_id.facility_location_id
