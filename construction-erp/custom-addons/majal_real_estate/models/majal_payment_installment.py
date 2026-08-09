from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalPaymentInstallment(models.Model):
    """One dated, priced row of a buyer's schedule.

    Unlike a plan line, an installment is concrete: it belongs to one
    reservation, it has a real due date and a real amount, and it records
    what has actually been received against it.
    """

    _name = "majal.payment.installment"
    _description = "Payment Installment"
    _order = "reservation_id, sequence, due_date, id"

    reservation_id = fields.Many2one(
        "majal.reservation", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    due_date = fields.Date(required=True)
    percentage = fields.Float()
    amount = fields.Monetary(required=True)
    amount_paid = fields.Monetary()
    amount_residual = fields.Monetary(compute="_compute_amount_residual", store=True)

    partner_id = fields.Many2one(
        related="reservation_id.partner_id", store=True, readonly=True)
    unit_id = fields.Many2one(related="reservation_id.unit_id", store=True, readonly=True)
    currency_id = fields.Many2one(
        related="reservation_id.currency_id", store=True, readonly=True)
    company_id = fields.Many2one(
        related="reservation_id.company_id", store=True, readonly=True)

    payment_date = fields.Date()
    state = fields.Selection(
        [("pending", "Pending"), ("partial", "Partially Paid"), ("paid", "Paid")],
        compute="_compute_state", store=True, default="pending",
    )
    is_overdue = fields.Boolean(compute="_compute_is_overdue", search="_search_is_overdue")

    @api.depends("amount", "amount_paid")
    def _compute_amount_residual(self):
        for installment in self:
            installment.amount_residual = installment.amount - installment.amount_paid

    @api.depends("amount", "amount_paid")
    def _compute_state(self):
        for installment in self:
            currency = installment.currency_id or self.env.company.currency_id
            if currency.compare_amounts(installment.amount_paid, installment.amount) >= 0:
                installment.state = "paid"
            elif currency.compare_amounts(installment.amount_paid, 0) > 0:
                installment.state = "partial"
            else:
                installment.state = "pending"

    @api.depends("due_date", "state")
    def _compute_is_overdue(self):
        today = fields.Date.context_today(self)
        for installment in self:
            installment.is_overdue = bool(
                installment.due_date
                and installment.due_date < today
                and installment.state != "paid"
            )

    def _search_is_overdue(self, operator, value):
        # is_overdue is derived, but it is the single most useful thing to
        # filter a collections list by, so it has to be searchable.
        if operator not in ("=", "!=") or not isinstance(value, bool):
            raise UserError(self.env._("Unsupported search on Overdue."))
        overdue_domain = [
            ("due_date", "<", fields.Date.context_today(self)),
            ("state", "!=", "paid"),
        ]
        looking_for_overdue = (operator == "=") == value
        if looking_for_overdue:
            return overdue_domain
        return ["!", *overdue_domain]

    def action_mark_paid(self):
        for installment in self:
            installment.amount_paid = installment.amount
            if not installment.payment_date:
                installment.payment_date = fields.Date.context_today(installment)
        return True
