from odoo import api, fields, models
from odoo.exceptions import ValidationError

# What a milestone is pegged to. Off-plan sales are sold on a schedule
# that is part calendar and part construction progress, so a plan line
# needs to say which of the two it follows rather than carrying a bare
# date that would be wrong for every buyer who signs on a different day.
TRIGGER_SELECTION = [
    ("booking", "On Booking"),
    ("days_after", "Days After Booking"),
    ("handover", "On Handover"),
]


class MajalPaymentPlan(models.Model):
    """A reusable installment structure, e.g. 20% on booking, 50% during
    construction, 30% on handover. The plan is a template: it holds
    percentages and triggers, never amounts or dates, because those only
    exist once it is applied to a particular reservation at a particular
    price on a particular day.
    """

    _name = "majal.payment.plan"
    _description = "Payment Plan"
    _order = "name"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    development_id = fields.Many2one(
        "majal.development",
        help="Leave empty to offer this plan across every development.")
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)
    line_ids = fields.One2many("majal.payment.plan.line", "plan_id", string="Milestones")
    total_percentage = fields.Float(compute="_compute_total_percentage", store=True)
    note = fields.Text()

    @api.depends("line_ids.percentage")
    def _compute_total_percentage(self):
        for plan in self:
            plan.total_percentage = sum(plan.line_ids.mapped("percentage"))

    @api.constrains("line_ids")
    def _check_total_percentage(self):
        for plan in self:
            if not plan.line_ids:
                continue
            # A plan that does not add up to the price is not a rounding
            # nuisance, it is a plan that will under- or over-bill every
            # buyer it is applied to.
            if abs(plan.total_percentage - 100.0) > 0.01:
                raise ValidationError(
                    self.env._(
                        "The milestones of %(plan)s add up to %(total).2f%%, not 100%%.",
                        plan=plan.display_name, total=plan.total_percentage,
                    )
                )


class MajalPaymentPlanLine(models.Model):
    _name = "majal.payment.plan.line"
    _description = "Payment Plan Milestone"
    _order = "plan_id, sequence, id"

    plan_id = fields.Many2one(
        "majal.payment.plan", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(
        required=True, help='Milestone label, e.g. "On booking", "Slab 10".')
    percentage = fields.Float(
        required=True, help="Share of the agreed price due at this milestone.")
    trigger = fields.Selection(TRIGGER_SELECTION, default="days_after", required=True)
    offset_days = fields.Integer(
        string="Days After Booking",
        help="Only used when the trigger is 'Days After Booking'.")

    @api.constrains("percentage")
    def _check_percentage(self):
        for line in self:
            if line.percentage <= 0:
                raise ValidationError(
                    self.env._("A milestone must claim a positive share of the price."))
