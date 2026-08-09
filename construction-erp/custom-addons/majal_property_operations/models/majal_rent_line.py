from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalLeaseRentLine(models.Model):
    """One rent instalment: the period it covers, what is due, what came in."""

    _name = "majal.lease.rent.line"
    _description = "Lease Rent Instalment"
    _order = "lease_id, sequence, due_date, id"

    lease_id = fields.Many2one(
        "majal.lease", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    period_start = fields.Date(required=True)
    period_end = fields.Date(required=True)
    due_date = fields.Date(required=True)
    amount = fields.Monetary(required=True)
    amount_paid = fields.Monetary()
    amount_residual = fields.Monetary(compute="_compute_amount_residual", store=True)
    payment_date = fields.Date()

    tenant_id = fields.Many2one(related="lease_id.tenant_id", store=True, readonly=True)
    unit_id = fields.Many2one(related="lease_id.unit_id", store=True, readonly=True)
    currency_id = fields.Many2one(
        related="lease_id.currency_id", store=True, readonly=True)
    company_id = fields.Many2one(related="lease_id.company_id", store=True, readonly=True)

    state = fields.Selection(
        [("pending", "Pending"), ("partial", "Partially Paid"), ("paid", "Paid")],
        compute="_compute_state", store=True, default="pending",
    )
    is_overdue = fields.Boolean(compute="_compute_is_overdue", search="_search_is_overdue")

    @api.depends("amount", "amount_paid")
    def _compute_amount_residual(self):
        for line in self:
            line.amount_residual = line.amount - line.amount_paid

    @api.depends("amount", "amount_paid")
    def _compute_state(self):
        for line in self:
            currency = line.currency_id or self.env.company.currency_id
            if currency.compare_amounts(line.amount_paid, line.amount) >= 0:
                line.state = "paid"
            elif currency.compare_amounts(line.amount_paid, 0) > 0:
                line.state = "partial"
            else:
                line.state = "pending"

    @api.depends("due_date", "state")
    def _compute_is_overdue(self):
        today = fields.Date.context_today(self)
        for line in self:
            line.is_overdue = bool(
                line.due_date and line.due_date < today and line.state != "paid")

    def _search_is_overdue(self, operator, value):
        if operator not in ("=", "!=") or not isinstance(value, bool):
            raise UserError(self.env._("Unsupported search on Overdue."))
        overdue_domain = [
            ("due_date", "<", fields.Date.context_today(self)),
            ("state", "!=", "paid"),
        ]
        if (operator == "=") == value:
            return overdue_domain
        return ["!", *overdue_domain]

    def action_mark_paid(self):
        for line in self:
            line.amount_paid = line.amount
            if not line.payment_date:
                line.payment_date = fields.Date.context_today(line)
        return True
