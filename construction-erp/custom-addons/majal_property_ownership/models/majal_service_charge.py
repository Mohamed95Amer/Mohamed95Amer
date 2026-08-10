from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

# How a budget is shared out across the units it covers.
ALLOCATION_METHODS = [
    ("area", "By Unit Area"),
    ("equal", "Equally Per Unit"),
]


class MajalServiceChargeBudget(models.Model):
    """What a development costs to run for a year, and who pays which part.

    Service charges are how a building is actually funded, so the budget
    comes first and the charges fall out of it. Raising charges without a
    budget behind them is how an owners' association ends up unable to
    answer the only question owners ever ask, which is what the money was
    spent on.
    """

    _name = "majal.service.charge.budget"
    _description = "Service Charge Budget"
    _inherit = ["mail.thread"]
    _order = "year desc, development_id"

    name = fields.Char(compute="_compute_name", store=True)
    development_id = fields.Many2one(
        "majal.development", required=True, ondelete="cascade",
        index=True, tracking=True)
    building_id = fields.Many2one(
        "majal.building", ondelete="cascade",
        domain="[('development_id', '=', development_id)]",
        help="Leave empty to cover the whole development.")
    year = fields.Integer(
        required=True, tracking=True,
        default=lambda self: fields.Date.context_today(self).year)
    company_id = fields.Many2one(
        related="development_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(
        related="development_id.currency_id", readonly=True)

    allocation_method = fields.Selection(
        ALLOCATION_METHODS, default="area", required=True, tracking=True,
        help="Area is the usual basis: a larger flat uses more of the "
             "building. Equal suits car parks and storage.")
    line_ids = fields.One2many(
        "majal.service.charge.budget.line", "budget_id", string="Cost Lines")
    amount_total = fields.Monetary(compute="_compute_amount_total", store=True)

    state = fields.Selection(
        [("draft", "Draft"), ("approved", "Approved"), ("closed", "Closed")],
        default="draft", required=True, tracking=True,
    )
    charge_ids = fields.One2many(
        "majal.service.charge", "budget_id", string="Charges")
    charge_count = fields.Integer(compute="_compute_charge_totals")
    amount_charged = fields.Monetary(compute="_compute_charge_totals")
    amount_collected = fields.Monetary(compute="_compute_charge_totals")
    collection_rate = fields.Float(
        compute="_compute_charge_totals", group_operator="avg")
    notes = fields.Text()

    _sql_constraints = [
        ("year_scope_uniq", "unique(development_id, building_id, year)",
         "That development already has a budget for this year."),
    ]

    @api.depends("development_id", "building_id", "year")
    def _compute_name(self):
        for budget in self:
            scope = budget.building_id.name or budget.development_id.name
            budget.name = f"{scope or ''} {budget.year or ''}".strip()

    @api.depends("line_ids.amount")
    def _compute_amount_total(self):
        for budget in self:
            budget.amount_total = sum(budget.line_ids.mapped("amount"))

    @api.depends("charge_ids.amount", "charge_ids.amount_paid")
    def _compute_charge_totals(self):
        for budget in self:
            budget.charge_count = len(budget.charge_ids)
            budget.amount_charged = sum(budget.charge_ids.mapped("amount"))
            budget.amount_collected = sum(budget.charge_ids.mapped("amount_paid"))
            budget.collection_rate = (
                budget.amount_collected / budget.amount_charged * 100.0
                if budget.amount_charged else 0.0)

    def _covered_units(self):
        self.ensure_one()
        domain = [("development_id", "=", self.development_id.id)]
        if self.building_id:
            domain.append(("building_id", "=", self.building_id.id))
        return self.env["majal.unit"].search(domain)

    def action_approve(self):
        for budget in self:
            if budget.state != "draft":
                raise UserError(self.env._("Only a draft budget can be approved."))
            if not budget.line_ids:
                raise UserError(
                    self.env._(
                        "%s has no cost lines, so there is nothing to share out.",
                        budget.display_name))
            budget.state = "approved"
        return True

    def action_generate_charges(self):
        """Share the budget across the units it covers.

        Regenerating is refused once anything has been paid: owners have
        been billed by then, and re-cutting the allocation would leave
        payments sitting against amounts nobody was asked for.
        """
        for budget in self:
            if budget.state == "draft":
                raise UserError(
                    self.env._("Approve the budget before charging owners."))
            paid = budget.charge_ids.filtered("amount_paid")
            if paid:
                raise UserError(
                    self.env._(
                        "%s already has payments against it. Adjust the "
                        "individual charges instead of re-cutting the "
                        "allocation.", budget.display_name))
            budget.charge_ids.unlink()

            units = budget._covered_units()
            if not units:
                raise UserError(
                    self.env._("%s covers no units.", budget.display_name))
            currency = budget.currency_id or self.env.company.currency_id

            if budget.allocation_method == "area":
                basis = {unit.id: unit.total_area for unit in units}
                if not sum(basis.values()):
                    raise UserError(
                        self.env._(
                            "No unit in %s has an area, so the budget cannot be "
                            "shared by area. Use equal allocation instead.",
                            budget.display_name))
            else:
                basis = {unit.id: 1.0 for unit in units}

            total_basis = sum(basis.values())
            running = 0.0
            vals_list = []
            ordered = units.sorted(lambda u: (u.building_id.id, u.name))
            for position, unit in enumerate(ordered):
                share = basis[unit.id] / total_basis
                amount = currency.round(budget.amount_total * share)
                if position == len(ordered) - 1:
                    # The last unit absorbs the rounding so the charges add
                    # up to the budget exactly; owners compare notes.
                    amount = currency.round(budget.amount_total - running)
                running += amount
                vals_list.append({
                    "budget_id": budget.id,
                    "unit_id": unit.id,
                    "partner_id": unit.owner_id.id or False,
                    "amount": amount,
                    "basis_value": basis[unit.id],
                    "due_date": fields.Date.to_date(f"{budget.year}-01-31"),
                })
            self.env["majal.service.charge"].create(vals_list)
        return True

    def action_view_charges(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Service Charges"),
            "res_model": "majal.service.charge",
            "view_mode": "list,form",
            "domain": [("budget_id", "=", self.id)],
        }


class MajalServiceChargeBudgetLine(models.Model):
    _name = "majal.service.charge.budget.line"
    _description = "Service Charge Budget Line"
    _order = "budget_id, sequence, id"

    budget_id = fields.Many2one(
        "majal.service.charge.budget", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Cost", required=True)
    category = fields.Selection(
        [
            ("cleaning", "Cleaning"),
            ("security", "Security"),
            ("utilities", "Utilities"),
            ("maintenance", "Maintenance"),
            ("insurance", "Insurance"),
            ("management", "Management Fee"),
            ("reserve", "Reserve Fund"),
            ("other", "Other"),
        ],
        default="other", required=True,
    )
    amount = fields.Monetary(required=True)
    currency_id = fields.Many2one(related="budget_id.currency_id", readonly=True)
    notes = fields.Char()


class MajalServiceCharge(models.Model):
    """One unit's share of a budget, and what its owner has paid of it."""

    _name = "majal.service.charge"
    _description = "Service Charge"
    _inherit = ["mail.thread"]
    _order = "due_date, unit_id"

    budget_id = fields.Many2one(
        "majal.service.charge.budget", required=True, ondelete="cascade", index=True)
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="cascade", index=True)
    partner_id = fields.Many2one(
        "res.partner", string="Owner", tracking=True,
        help="Empty where the unit has not been handed over yet; the "
             "developer carries the charge until it has.")
    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True, index=True)
    building_id = fields.Many2one(related="unit_id.building_id", store=True, readonly=True)
    company_id = fields.Many2one(related="unit_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="unit_id.currency_id", readonly=True)

    year = fields.Integer(related="budget_id.year", store=True, readonly=True)
    basis_value = fields.Float(
        string="Allocation Basis", readonly=True,
        help="Area or unit count this share was calculated from.")
    amount = fields.Monetary(required=True, tracking=True)
    amount_paid = fields.Monetary(tracking=True)
    amount_residual = fields.Monetary(compute="_compute_residual", store=True)
    due_date = fields.Date(required=True)
    payment_date = fields.Date()

    state = fields.Selection(
        [("pending", "Pending"), ("partial", "Partially Paid"), ("paid", "Paid")],
        compute="_compute_state", store=True, default="pending",
    )
    is_overdue = fields.Boolean(compute="_compute_is_overdue", search="_search_is_overdue")

    @api.depends("amount", "amount_paid")
    def _compute_residual(self):
        for charge in self:
            charge.amount_residual = charge.amount - charge.amount_paid

    @api.depends("amount", "amount_paid")
    def _compute_state(self):
        for charge in self:
            currency = charge.currency_id or self.env.company.currency_id
            if currency.compare_amounts(charge.amount_paid, charge.amount) >= 0:
                charge.state = "paid"
            elif currency.compare_amounts(charge.amount_paid, 0) > 0:
                charge.state = "partial"
            else:
                charge.state = "pending"

    @api.depends("due_date", "state")
    def _compute_is_overdue(self):
        today = fields.Date.context_today(self)
        for charge in self:
            charge.is_overdue = bool(
                charge.due_date and charge.due_date < today and charge.state != "paid")

    def _search_is_overdue(self, operator, value):
        if operator not in ("=", "!=") or not isinstance(value, bool):
            raise UserError(self.env._("Unsupported search on Overdue."))
        overdue = [
            ("due_date", "<", fields.Date.context_today(self)),
            ("state", "!=", "paid"),
        ]
        return overdue if (operator == "=") == value else ["!", *overdue]

    @api.constrains("amount")
    def _check_amount(self):
        for charge in self:
            if charge.amount < 0:
                raise ValidationError(
                    self.env._("A service charge cannot be negative."))

    def action_mark_paid(self):
        for charge in self:
            charge.amount_paid = charge.amount
            if not charge.payment_date:
                charge.payment_date = fields.Date.context_today(charge)
        return True

    def action_sync_owner(self):
        """Pick up the current owner, for charges raised before handover."""
        for charge in self:
            if charge.unit_id.owner_id:
                charge.partner_id = charge.unit_id.owner_id
        return True
