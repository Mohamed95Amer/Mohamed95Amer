from odoo import fields, models


class FacilityFailureCode(models.Model):
    _name = "facility.failure.code"
    _description = "Failure Code"
    _order = "failure_type, code, name"

    name = fields.Char(required=True)
    code = fields.Char()
    failure_type = fields.Selection(
        [("problem", "Problem"), ("cause", "Cause"), ("remedy", "Remedy")],
        default="problem", required=True)
    active = fields.Boolean(default=True)


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
