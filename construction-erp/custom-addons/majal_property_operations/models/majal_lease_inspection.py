from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalLeaseInspection(models.Model):
    """The condition of a unit when a tenant moves in, and again when they
    leave.

    The move-out inspection is only meaningful against the move-in one:
    a deposit deduction has to point at something that was not like that
    when they arrived. So a move-out can copy the move-in's findings and
    the argument becomes about what changed, not about what somebody
    remembers.
    """

    _name = "majal.lease.inspection"
    _description = "Lease Inspection"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "inspection_date desc, id desc"

    name = fields.Char(compute="_compute_name", store=True)
    lease_id = fields.Many2one(
        "majal.lease", required=True, ondelete="cascade", index=True, tracking=True)
    inspection_type = fields.Selection(
        [("move_in", "Move In"), ("move_out", "Move Out")],
        required=True, default="move_in", tracking=True,
    )
    unit_id = fields.Many2one(related="lease_id.unit_id", store=True, readonly=True)
    tenant_id = fields.Many2one(related="lease_id.tenant_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="lease_id.currency_id", readonly=True)
    company_id = fields.Many2one(related="lease_id.company_id", store=True, readonly=True)

    inspection_date = fields.Date(
        required=True, default=fields.Date.context_today, tracking=True)
    inspector_id = fields.Many2one(
        "res.users", string="Inspector", default=lambda self: self.env.user)
    state = fields.Selection(
        [("draft", "Draft"), ("done", "Completed"), ("cancelled", "Cancelled")],
        default="draft", required=True, tracking=True,
    )
    line_ids = fields.One2many(
        "majal.lease.inspection.line", "inspection_id", string="Findings")
    meter_electricity = fields.Char(string="Electricity Meter")
    meter_water = fields.Char(string="Water Meter")
    keys_handed = fields.Integer(string="Keys Handed Over")
    notes = fields.Text()

    deduction_total = fields.Monetary(compute="_compute_deduction_total", store=True)
    deposit = fields.Monetary(related="lease_id.deposit", readonly=True)
    deposit_refund = fields.Monetary(compute="_compute_deduction_total", store=True)

    @api.depends("inspection_type", "unit_id", "inspection_date")
    def _compute_name(self):
        labels = dict(self._fields["inspection_type"].selection)
        for inspection in self:
            inspection.name = "%s - %s" % (
                labels.get(inspection.inspection_type, ""),
                inspection.unit_id.name or "",
            )

    @api.depends("line_ids.deduction_amount", "deposit", "inspection_type")
    def _compute_deduction_total(self):
        for inspection in self:
            total = sum(inspection.line_ids.mapped("deduction_amount"))
            inspection.deduction_total = total
            # A move-in cannot deduct anything -- there is nothing to
            # compare it against yet.
            refund = (inspection.deposit or 0.0) - total
            inspection.deposit_refund = max(refund, 0.0)

    @api.constrains("inspection_type", "lease_id")
    def _check_one_of_each_type(self):
        for inspection in self:
            duplicate = self.search_count([
                ("id", "!=", inspection.id),
                ("lease_id", "=", inspection.lease_id.id),
                ("inspection_type", "=", inspection.inspection_type),
                ("state", "!=", "cancelled"),
            ])
            if duplicate:
                raise UserError(
                    self.env._(
                        "%(lease)s already has a %(kind)s inspection.",
                        lease=inspection.lease_id.display_name,
                        kind=dict(self._fields["inspection_type"].selection)[
                            inspection.inspection_type],
                    )
                )

    def action_copy_from_move_in(self):
        """Bring the move-in findings across, so the move-out is a comparison
        rather than a fresh opinion."""
        self.ensure_one()
        if self.inspection_type != "move_out":
            raise UserError(
                self.env._("Only a move-out inspection compares against move-in."))
        move_in = self.search([
            ("lease_id", "=", self.lease_id.id),
            ("inspection_type", "=", "move_in"),
            ("state", "!=", "cancelled"),
        ], limit=1)
        if not move_in:
            raise UserError(
                self.env._(
                    "%s has no move-in inspection to compare against.",
                    self.lease_id.display_name))
        self.line_ids.unlink()
        self.env["majal.lease.inspection.line"].create([
            {
                "inspection_id": self.id,
                "name": line.name,
                "location": line.location,
                "condition_in": line.condition_out or line.condition_in,
                "sequence": line.sequence,
            }
            for line in move_in.line_ids
        ])
        return True

    def action_done(self):
        for inspection in self:
            if inspection.state != "draft":
                raise UserError(
                    self.env._("Only a draft inspection can be completed."))
            inspection.state = "done"
            if inspection.inspection_type == "move_out":
                inspection.lease_id.message_post(body=self.env._(
                    "Move-out inspection completed. Deductions: %(deduction)s, "
                    "deposit to refund: %(refund)s.",
                    deduction=inspection.deduction_total,
                    refund=inspection.deposit_refund,
                ))
        return True

    def action_cancel(self):
        self.write({"state": "cancelled"})
        return True


class MajalLeaseInspectionLine(models.Model):
    _name = "majal.lease.inspection.line"
    _description = "Lease Inspection Finding"
    _order = "inspection_id, sequence, id"

    inspection_id = fields.Many2one(
        "majal.lease.inspection", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Item", required=True)
    location = fields.Char(help='Where in the unit, e.g. "Kitchen".')
    condition_in = fields.Selection(
        [("good", "Good"), ("fair", "Fair"), ("poor", "Poor"), ("damaged", "Damaged")],
        string="At Move In", default="good",
    )
    condition_out = fields.Selection(
        [("good", "Good"), ("fair", "Fair"), ("poor", "Poor"), ("damaged", "Damaged")],
        string="At Move Out",
    )
    is_tenant_liable = fields.Boolean(
        string="Tenant Liable",
        help="Fair wear and tear is not a deduction; deliberate or negligent "
             "damage is.")
    deduction_amount = fields.Monetary()
    currency_id = fields.Many2one(
        related="inspection_id.currency_id", readonly=True)
    notes = fields.Char()

    @api.onchange("is_tenant_liable")
    def _onchange_is_tenant_liable(self):
        for line in self:
            if not line.is_tenant_liable:
                line.deduction_amount = 0.0

    @api.constrains("deduction_amount", "is_tenant_liable")
    def _check_deduction_is_attributed(self):
        for line in self:
            if line.deduction_amount and not line.is_tenant_liable:
                raise UserError(
                    self.env._(
                        "%s has a deduction but is not marked as the tenant's "
                        "liability. Deposits cannot be charged for fair wear "
                        "and tear.", line.name))
