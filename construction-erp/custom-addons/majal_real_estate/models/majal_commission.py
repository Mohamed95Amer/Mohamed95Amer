from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalCommission(models.Model):
    """What a broker earned on a specific sale.

    A commission is raised only when a reservation actually converts, so
    the list is a record of earned money rather than of hoped-for money.
    Approval and payment are kept as separate steps because the person who
    confirms the sale is rarely the person who releases the payment.
    """

    _name = "majal.commission"
    _description = "Broker Commission"
    _inherit = ["mail.thread"]
    _order = "id desc"

    name = fields.Char(compute="_compute_name", store=True)
    reservation_id = fields.Many2one(
        "majal.reservation", required=True, ondelete="cascade", index=True)
    broker_id = fields.Many2one("res.partner", required=True, tracking=True)
    unit_id = fields.Many2one(related="reservation_id.unit_id", store=True, readonly=True)
    development_id = fields.Many2one(
        related="reservation_id.development_id", store=True, readonly=True)
    currency_id = fields.Many2one(
        related="reservation_id.currency_id", store=True, readonly=True)
    company_id = fields.Many2one(
        related="reservation_id.company_id", store=True, readonly=True)

    sale_price = fields.Monetary(readonly=True)
    rate = fields.Float(string="Rate (%)", readonly=True)
    amount = fields.Monetary(required=True, tracking=True)
    state = fields.Selection(
        [("draft", "Draft"), ("approved", "Approved"), ("paid", "Paid"),
         ("cancelled", "Cancelled")],
        default="draft", required=True, tracking=True,
    )
    payment_date = fields.Date()

    _sql_constraints = [
        ("reservation_broker_uniq", "unique(reservation_id, broker_id)",
         "This broker already has a commission on this reservation."),
    ]

    @api.depends("broker_id", "unit_id")
    def _compute_name(self):
        for commission in self:
            commission.name = " - ".join(
                part for part in (commission.unit_id.name, commission.broker_id.name)
                if part
            ) or "Commission"

    def action_approve(self):
        for commission in self:
            if commission.state != "draft":
                raise UserError(
                    self.env._("Only a draft commission can be approved."))
            commission.state = "approved"
        return True

    def action_mark_paid(self):
        for commission in self:
            if commission.state != "approved":
                raise UserError(
                    self.env._(
                        "Approve %s before marking it paid.", commission.display_name))
            commission.state = "paid"
            commission.payment_date = fields.Date.context_today(commission)
        return True

    def action_cancel(self):
        for commission in self:
            if commission.state == "paid":
                raise UserError(
                    self.env._("A paid commission cannot be cancelled."))
            commission.state = "cancelled"
        return True
