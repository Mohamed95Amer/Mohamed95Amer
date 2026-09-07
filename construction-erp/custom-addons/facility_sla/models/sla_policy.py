from odoo import api, fields, models


class FacilitySlaPolicy(models.Model):
    """A response/resolution commitment for a class of work orders.

    FM contracts are written as a matrix: a critical chiller failure gets a
    one-hour response, a routine office lamp gets two days. A policy is that
    matrix expressed as matching criteria plus the two clocks, so the promise
    that was sold can be measured against what was delivered.

    Matching is deliberately "most specific wins": policies are ordered by
    sequence and the first one whose criteria all match is applied. An empty
    criterion means "any", so a broad catch-all sits at the bottom with a high
    sequence and the sharp exceptions sit above it.
    """

    _name = "facility.sla.policy"
    _description = "Facility SLA Policy"
    _order = "sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(
        default=10,
        help="Lower numbers are evaluated first. Put the most specific "
             "policies at the top and the catch-all at the bottom.",
    )
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company", default=lambda self: self.env.company, required=True
    )

    # --- Matching criteria (empty = matches anything) ------------------------
    priority = fields.Selection(
        [("0", "Very Low"), ("1", "Low"), ("2", "Normal"), ("3", "High")],
        string="Work Order Priority",
    )
    maintenance_type = fields.Selection(
        [("corrective", "Corrective"), ("preventive", "Preventive")]
    )
    category_id = fields.Many2one(
        "maintenance.equipment.category", string="Equipment Category"
    )
    criticality = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"),
         ("critical", "Critical")],
        string="Asset Criticality",
    )

    # --- The commitment ------------------------------------------------------
    response_hours = fields.Float(
        string="Response (h)",
        required=True,
        default=4.0,
        help="Working hours allowed between raising the request and the first "
             "recorded response.",
    )
    resolution_hours = fields.Float(
        string="Resolution (h)",
        required=True,
        default=24.0,
        help="Working hours allowed between raising the request and closing it.",
    )
    calendar_id = fields.Many2one(
        "resource.calendar",
        string="Business Calendar",
        help="Working hours the clocks run against. Leave empty to use the "
             "company calendar; set a 24/7 calendar for round-the-clock cover.",
    )
    at_risk_ratio = fields.Float(
        string="At-Risk Threshold",
        default=0.8,
        help="Share of the allowance after which a work order is flagged "
             "at-risk, so it can be chased before it breaches. 0.8 = 80%.",
    )
    request_count = fields.Integer(compute="_compute_request_count")

    _sql_constraints = [
        ("response_positive", "check(response_hours > 0)",
         "The response allowance must be greater than zero."),
        ("resolution_positive", "check(resolution_hours > 0)",
         "The resolution allowance must be greater than zero."),
        ("at_risk_ratio_range", "check(at_risk_ratio > 0 and at_risk_ratio <= 1)",
         "The at-risk threshold must be between 0 and 1."),
    ]

    def _compute_request_count(self):
        counts = dict(
            self.env["maintenance.request"]._read_group(
                [("sla_policy_id", "in", self.ids)],
                ["sla_policy_id"],
                ["__count"],
            )
        )
        for policy in self:
            policy.request_count = counts.get(policy, 0)

    def _working_calendar(self):
        self.ensure_one()
        return self.calendar_id or self.company_id.resource_calendar_id

    def action_view_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Work Orders"),
            "res_model": "maintenance.request",
            "view_mode": "list,form",
            "domain": [("sla_policy_id", "=", self.id)],
        }

    @api.model
    def _match(self, request):
        """Return the first policy whose criteria all match the request."""
        equipment = request.equipment_id
        for policy in self.search([("company_id", "in", [request.company_id.id, False])]):
            if policy.priority and policy.priority != request.priority:
                continue
            if (policy.maintenance_type
                    and policy.maintenance_type != request.maintenance_type):
                continue
            if policy.category_id and policy.category_id != equipment.category_id:
                continue
            if policy.criticality:
                # criticality lives on the asset; a request with no equipment
                # cannot satisfy a criticality-specific policy.
                if not equipment or equipment.criticality != policy.criticality:
                    continue
            return policy
        return self.browse()
