from odoo import api, fields, models
from odoo.exceptions import UserError

# Positive lines are money collected for the owner; negative lines are what
# is taken out before it reaches them.
LINE_KINDS = [
    ("rent", "Rent Collected"),
    ("other_income", "Other Income"),
    ("commission", "Management Commission"),
    ("service_charge", "Service Charge"),
    ("maintenance", "Maintenance & Repairs"),
    ("other_cost", "Other Deduction"),
]

INCOME_KINDS = ("rent", "other_income")


class MajalOwnerStatement(models.Model):
    """What was collected for an owner in a period, what was taken out of
    it, and what is therefore owed to them.

    Collecting rent is only half of managing a property for somebody else.
    Until this exists, the money's journey ends at "received" and the
    owner has to be told the rest over the phone.
    """

    _name = "majal.owner.statement"
    _description = "Owner Statement"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "date_to desc, id desc"

    name = fields.Char(
        string="Reference", required=True, readonly=True, copy=False, default="/")
    partner_id = fields.Many2one(
        "res.partner", string="Owner", required=True, index=True, tracking=True)
    development_id = fields.Many2one(
        "majal.development", tracking=True,
        help="Limit the statement to one development; empty covers every "
             "unit this owner holds.")
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(
        "res.currency", related="company_id.currency_id", readonly=True)

    date_from = fields.Date(required=True, tracking=True)
    date_to = fields.Date(required=True, tracking=True)
    commission_rate = fields.Float(
        string="Management Fee (%)", default=5.0,
        help="Taken on rent collected in the period.")

    line_ids = fields.One2many(
        "majal.owner.statement.line", "statement_id", string="Lines")
    amount_income = fields.Monetary(compute="_compute_totals", store=True)
    amount_deductions = fields.Monetary(compute="_compute_totals", store=True)
    amount_net = fields.Monetary(
        string="Net Payable", compute="_compute_totals", store=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("confirmed", "Confirmed"),
            ("paid", "Paid"),
            ("cancelled", "Cancelled"),
        ],
        default="draft", required=True, tracking=True, copy=False,
    )
    payment_date = fields.Date(readonly=True, copy=False)
    payment_reference = fields.Char(copy=False)
    notes = fields.Text()

    @api.depends("line_ids.amount", "line_ids.kind")
    def _compute_totals(self):
        for statement in self:
            income = sum(
                line.amount for line in statement.line_ids
                if line.kind in INCOME_KINDS)
            deductions = sum(
                line.amount for line in statement.line_ids
                if line.kind not in INCOME_KINDS)
            statement.amount_income = income
            statement.amount_deductions = deductions
            statement.amount_net = income - deductions

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "/") == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code(
                    "majal.owner.statement") or "/"
        return super().create(vals_list)

    def _owned_units(self):
        self.ensure_one()
        domain = [("owner_id", "=", self.partner_id.id)]
        if self.development_id:
            domain.append(("development_id", "=", self.development_id.id))
        return self.env["majal.unit"].search(domain)

    def action_gather(self):
        """Pull the period's rent, service charges and costs onto the
        statement.

        Only money that actually arrived is counted: rent invoiced and not
        paid is not the owner's to receive, and putting it here would have
        us paying out cash we never collected.
        """
        for statement in self:
            if statement.state != "draft":
                raise UserError(
                    self.env._("Only a draft statement can be rebuilt."))
            statement.line_ids.unlink()
            units = statement._owned_units()
            if not units:
                raise UserError(
                    self.env._(
                        "%s owns no units in this scope.",
                        statement.partner_id.display_name))

            vals_list = []
            rent_collected = 0.0
            # Leasing is a separate module: an owners' association running
            # service charges only will not have it installed.
            RentLine = self.env.get("majal.lease.rent.line")
            if RentLine is not None:
                rent_lines = RentLine.search([
                    ("unit_id", "in", units.ids),
                    ("payment_date", ">=", statement.date_from),
                    ("payment_date", "<=", statement.date_to),
                    ("amount_paid", ">", 0),
                ])
                for line in rent_lines:
                    rent_collected += line.amount_paid
                    vals_list.append({
                        "statement_id": statement.id,
                        "kind": "rent",
                        "name": line.name,
                        "unit_id": line.unit_id.id,
                        "date": line.payment_date,
                        "amount": line.amount_paid,
                    })

            charges = self.env["majal.service.charge"].search([
                ("unit_id", "in", units.ids),
                ("due_date", ">=", statement.date_from),
                ("due_date", "<=", statement.date_to),
            ])
            for charge in charges:
                vals_list.append({
                    "statement_id": statement.id,
                    "kind": "service_charge",
                    "name": self.env._("Service charge %s", charge.year),
                    "unit_id": charge.unit_id.id,
                    "date": charge.due_date,
                    "amount": charge.amount,
                })

            if rent_collected and statement.commission_rate:
                vals_list.append({
                    "statement_id": statement.id,
                    "kind": "commission",
                    "name": self.env._(
                        "Management fee at %(rate)s%%",
                        rate=statement.commission_rate),
                    "date": statement.date_to,
                    "amount": (statement.currency_id or self.env.company.currency_id)
                              .round(rent_collected * statement.commission_rate / 100.0),
                })

            self.env["majal.owner.statement.line"].create(vals_list)
        return True

    def action_confirm(self):
        for statement in self:
            if statement.state != "draft":
                raise UserError(
                    self.env._("Only a draft statement can be confirmed."))
            if not statement.line_ids:
                raise UserError(
                    self.env._(
                        "%s has nothing on it.", statement.display_name))
            statement.state = "confirmed"
        return True

    def action_mark_paid(self):
        for statement in self:
            if statement.state != "confirmed":
                raise UserError(
                    self.env._(
                        "Confirm %s before recording a payout.",
                        statement.display_name))
            statement.state = "paid"
            statement.payment_date = fields.Date.context_today(statement)
        return True

    def action_cancel(self):
        for statement in self:
            if statement.state == "paid":
                raise UserError(
                    self.env._(
                        "%s has already been paid out; it cannot be cancelled.",
                        statement.display_name))
            statement.state = "cancelled"
        return True

    def action_reset_to_draft(self):
        for statement in self:
            if statement.state == "paid":
                raise UserError(
                    self.env._("A paid statement cannot be reopened."))
            statement.state = "draft"
        return True


class MajalOwnerStatementLine(models.Model):
    _name = "majal.owner.statement.line"
    _description = "Owner Statement Line"
    _order = "statement_id, date, id"

    statement_id = fields.Many2one(
        "majal.owner.statement", required=True, ondelete="cascade", index=True)
    kind = fields.Selection(LINE_KINDS, required=True, default="other_cost")
    name = fields.Char(required=True)
    unit_id = fields.Many2one("majal.unit", ondelete="set null")
    date = fields.Date(required=True, default=fields.Date.context_today)
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(
        related="statement_id.currency_id", readonly=True)
    is_income = fields.Boolean(compute="_compute_is_income", store=True)
    notes = fields.Char()

    @api.depends("kind")
    def _compute_is_income(self):
        for line in self:
            line.is_income = line.kind in INCOME_KINDS
