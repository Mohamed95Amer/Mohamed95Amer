from odoo import fields, models


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
    facility_location_id = fields.Many2one(
        related="equipment_id.facility_location_id", store=True)
