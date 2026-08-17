from odoo import api, fields, models
from odoo.exceptions import UserError

# A cheque is an instrument, not a payment. It becomes a payment when it
# clears, and it can fail after it has been handed over -- which is the whole
# reason it needs a record of its own rather than a paid flag on a schedule.
CHEQUE_STATES = [
    ("held", "Held"),
    ("deposited", "Deposited"),
    ("cleared", "Cleared"),
    ("bounced", "Bounced"),
    ("returned", "Returned"),
    ("cancelled", "Cancelled"),
]

# States in which the cheque is still expected to turn into money.
LIVE_CHEQUE_STATES = ("held", "deposited")


class MajalCheque(models.Model):
    """A post-dated cheque held against something owed.

    Where cheques are the normal way rent and instalments are paid, the
    schedule alone cannot answer the questions collections actually asks:
    what is in the safe, what is with the bank this week, and what came
    back. Clearing a cheque is what records the payment; nothing else
    writes to the schedule behind it.
    """

    _name = "majal.cheque"
    _description = "Cheque"
    _inherit = ["mail.thread"]
    _order = "due_date, id"

    name = fields.Char(
        string="Cheque No.", required=True, tracking=True, index=True)
    partner_id = fields.Many2one(
        "res.partner", string="Drawer", required=True, tracking=True,
        help="Whoever signed the cheque, which is not always the buyer or "
             "tenant it pays for.")
    bank_name = fields.Char(tracking=True)
    amount = fields.Monetary(required=True, tracking=True)
    currency_id = fields.Many2one(
        "res.currency", required=True,
        default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)
    due_date = fields.Date(required=True, tracking=True)
    deposited_date = fields.Date(readonly=True, copy=False)
    cleared_date = fields.Date(readonly=True, copy=False)
    state = fields.Selection(
        CHEQUE_STATES, default="held", required=True, tracking=True, copy=False)
    bounce_reason = fields.Char(copy=False)
    notes = fields.Text()

    installment_id = fields.Many2one(
        "majal.payment.installment", string="Instalment",
        ondelete="set null", index=True,
        help="The buyer instalment this cheque settles, if any.")
    unit_id = fields.Many2one(
        related="installment_id.unit_id", store=True, readonly=True)

    is_due = fields.Boolean(compute="_compute_is_due", search="_search_is_due")

    _sql_constraints = [
        ("number_partner_uniq", "unique(name, partner_id, company_id)",
         "This cheque number is already recorded for this drawer."),
    ]

    @api.depends("name", "partner_id")
    def _compute_display_name(self):
        for cheque in self:
            cheque.display_name = " - ".join(
                part for part in (cheque.name, cheque.partner_id.name) if part)

    @api.depends("due_date", "state")
    def _compute_is_due(self):
        today = fields.Date.context_today(self)
        for cheque in self:
            cheque.is_due = bool(
                cheque.due_date and cheque.due_date <= today
                and cheque.state in LIVE_CHEQUE_STATES)

    def _search_is_due(self, operator, value):
        if operator not in ("=", "!=") or not isinstance(value, bool):
            raise UserError(self.env._("Unsupported search on Due."))
        due = [
            ("due_date", "<=", fields.Date.context_today(self)),
            ("state", "in", list(LIVE_CHEQUE_STATES)),
        ]
        return due if (operator == "=") == value else ["!", *due]

    # --- what the cheque is settling ---------------------------------------

    def _settlement_targets(self):
        """The record this cheque pays, as (record, paid_field) pairs.

        Extended by other modules -- leasing adds rent lines -- so that
        clearing stays one code path however many things can be paid by
        cheque.
        """
        self.ensure_one()
        if self.installment_id:
            return [(self.installment_id, "amount_paid")]
        return []

    def _apply_to_targets(self, amount):
        for record, field_name in self._settlement_targets():
            record.sudo()[field_name] += amount
            if amount > 0 and "payment_date" in record._fields and not record.payment_date:
                record.sudo().payment_date = fields.Date.context_today(self)

    # --- lifecycle ---------------------------------------------------------

    def action_deposit(self):
        for cheque in self:
            if cheque.state != "held":
                raise UserError(
                    self.env._("Only a held cheque can be deposited."))
            cheque.state = "deposited"
            cheque.deposited_date = fields.Date.context_today(cheque)
        return True

    def action_clear(self):
        """Clearing is the moment the money exists, so this is the only place
        a cheque writes to the schedule behind it."""
        for cheque in self:
            if cheque.state not in ("held", "deposited"):
                raise UserError(
                    self.env._(
                        "%s cannot clear from its current state.",
                        cheque.display_name))
            cheque._apply_to_targets(cheque.amount)
            cheque.state = "cleared"
            cheque.cleared_date = fields.Date.context_today(cheque)
        return True

    def action_bounce(self):
        """A bounced cheque takes its money back out again. Leaving the
        schedule paid would show a settled instalment nobody was paid for."""
        for cheque in self:
            if cheque.state == "cleared":
                cheque._apply_to_targets(-cheque.amount)
            elif cheque.state not in ("held", "deposited"):
                raise UserError(
                    self.env._(
                        "%s cannot bounce from its current state.",
                        cheque.display_name))
            cheque.state = "bounced"
            cheque.cleared_date = False
        return True

    def action_return(self):
        for cheque in self:
            if cheque.state == "cleared":
                raise UserError(
                    self.env._(
                        "%s has already cleared; it cannot be handed back.",
                        cheque.display_name))
            cheque.state = "returned"
        return True

    def action_cancel(self):
        for cheque in self:
            if cheque.state == "cleared":
                raise UserError(
                    self.env._("A cleared cheque cannot be cancelled."))
            cheque.state = "cancelled"
        return True

    def action_reset_to_held(self):
        for cheque in self:
            if cheque.state in ("cleared",):
                raise UserError(
                    self.env._("A cleared cheque cannot be reopened."))
            cheque.state = "held"
            cheque.deposited_date = False
        return True
