import operator

from odoo import api, fields, models

COMPARATORS = {
    "<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge,
    "=": operator.eq, "!=": operator.ne,
}


class FacilityMaintenanceContract(models.Model):
    """An annual maintenance contract over a list of assets.

    The recurring billing itself is OCA's `contract`; nothing here re-invents
    an invoice schedule. What is added is the part an FM company actually
    manages: what the contract covers, what it promised, and whether the work
    being done under it still costs less than the fee being charged for it.

    A maintenance contract is sold as a fixed monthly fee against an unknown
    volume of work, so the only number that matters is the margin — recurring
    revenue invoiced, less the cost of the work orders raised against the
    covered assets. Out-of-scope work is separated out, because that cost is
    recoverable and must not be read as the contract losing money.
    """

    _inherit = "contract.contract"

    is_amc = fields.Boolean(
        string="Maintenance Contract",
        help="Treat this contract as a facilities maintenance agreement: it "
             "covers assets, carries an SLA and is measured for margin.",
    )
    sla_policy_id = fields.Many2one(
        "facility.sla.policy",
        string="Contract SLA",
        help="Response and resolution times promised by this contract. It "
             "overrides the general SLA matrix for work on covered assets — "
             "what was sold beats what is standard.",
    )
    covers_preventive = fields.Boolean(string="Covers Preventive", default=True)
    covers_corrective = fields.Boolean(string="Covers Corrective", default=True)
    covers_parts = fields.Boolean(
        string="Parts Included", default=False,
        help="When off, parts consumed on covered work are recoverable from "
             "the client rather than absorbed by the fee.",
    )
    pm_visits_included = fields.Integer(
        string="PM Visits Included",
        help="Planned visits the fee buys over the contract term. Leave at "
             "zero when the contract is not written that way.",
    )
    renewal_notice_days = fields.Integer(
        string="Renewal Notice (days)", default=60,
        help="How long before the end date the contract should be flagged "
             "for renewal.",
    )
    renewal_notified = fields.Boolean(readonly=True, copy=False)

    request_ids = fields.One2many(
        "maintenance.request", "facility_contract_id", string="Work Orders")
    request_count = fields.Integer(
        string="Work Orders", compute="_compute_contract_performance")
    pm_visits_used = fields.Integer(
        string="PM Visits Used", compute="_compute_contract_performance")
    pm_visits_remaining = fields.Integer(
        string="PM Visits Remaining",
        compute="_compute_contract_performance",
        search="_search_pm_visits_remaining")
    covered_cost = fields.Monetary(
        compute="_compute_contract_performance", search="_search_covered_cost",
        currency_field="currency_id", string="Cost Absorbed",
        help="Cost of work the fee has to pay for.")
    chargeable_cost = fields.Monetary(
        compute="_compute_contract_performance", search="_search_chargeable_cost",
        currency_field="currency_id", string="Recoverable Cost",
        help="Cost of work outside the scope of cover — billable on top.")
    invoiced_revenue = fields.Monetary(
        compute="_compute_contract_performance", currency_field="currency_id",
        string="Invoiced")
    margin = fields.Monetary(
        compute="_compute_contract_performance", search="_search_margin",
        currency_field="currency_id")
    margin_percent = fields.Float(
        compute="_compute_contract_performance", string="Margin %")
    days_to_expiry = fields.Integer(
        compute="_compute_days_to_expiry", search="_search_days_to_expiry")

    @api.depends(
        "request_ids.total_cost", "request_ids.contract_covered",
        "request_ids.maintenance_type", "request_ids.stage_id.done",
        "pm_visits_included",
    )
    def _compute_contract_performance(self):
        for contract in self:
            requests = contract.request_ids
            contract.request_count = len(requests)
            covered = requests.filtered("contract_covered")
            contract.covered_cost = sum(covered.mapped("total_cost"))
            contract.chargeable_cost = sum(
                (requests - covered).mapped("total_cost"))
            # Only completed planned visits count against the entitlement — a
            # visit that is scheduled has not been delivered.
            contract.pm_visits_used = len(covered.filtered(
                lambda r: r.maintenance_type == "preventive" and r.stage_id.done
            ))
            contract.pm_visits_remaining = max(
                contract.pm_visits_included - contract.pm_visits_used, 0)

            revenue = sum(
                move.amount_untaxed_signed
                # The Facilities Manager is entitled to this contract-level
                # KPI without inheriting broad Accounting application access.
                # Only the deliberate aggregate is exposed by this model.
                for move in contract.sudo()._get_related_invoices()
                if move.state == "posted"
            )
            contract.invoiced_revenue = revenue
            contract.margin = revenue - contract.covered_cost
            contract.margin_percent = (
                contract.margin / revenue * 100.0 if revenue else 0.0)

    @api.depends("date_end")
    def _compute_days_to_expiry(self):
        today = fields.Date.context_today(self)
        for contract in self:
            contract.days_to_expiry = (
                (contract.date_end - today).days if contract.date_end else 0)

    def _search_days_to_expiry(self, operator_, value):
        """Days remaining rises with the end date, so the comparison carries
        straight over onto the stored column."""
        limit = fields.Date.add(fields.Date.context_today(self), days=value)
        return [("date_end", "!=", False), ("date_end", operator_, limit)]

    def _search_performance(self, field, operator_, value):
        """Filter on a performance figure.

        These are live figures over work orders and posted invoices rather than
        stored columns, so they cannot be pushed into SQL. Evaluating them over
        the maintenance contracts only keeps the set small — this is a register
        of contracts, not a transaction table.
        """
        contracts = self.search([("is_amc", "=", True)])
        compare = COMPARATORS[operator_]
        matching = contracts.filtered(lambda c: compare(c[field], value))
        return [("id", "in", matching.ids)]

    def _search_margin(self, operator_, value):
        return self._search_performance("margin", operator_, value)

    def _search_covered_cost(self, operator_, value):
        return self._search_performance("covered_cost", operator_, value)

    def _search_chargeable_cost(self, operator_, value):
        return self._search_performance("chargeable_cost", operator_, value)

    def _search_pm_visits_remaining(self, operator_, value):
        return self._search_performance("pm_visits_remaining", operator_, value)

    def _covers(self, request):
        """Is this request the kind of work the fee has already paid for?"""
        self.ensure_one()
        if request.maintenance_type == "preventive":
            return self.covers_preventive
        return self.covers_corrective

    @api.model
    def _match_for_equipment(self, equipment, date):
        """The live maintenance contract covering an asset on a given date."""
        if not equipment:
            return self.browse()
        date = date or fields.Date.context_today(self)
        return self.search([
            ("is_amc", "=", True),
            ("equipment_ids", "in", equipment.ids),
            "|", ("date_start", "=", False), ("date_start", "<=", date),
            "|", ("date_end", "=", False), ("date_end", ">=", date),
        ], limit=1)

    def action_view_contract_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Work Orders"),
            "res_model": "maintenance.request",
            "view_mode": "list,form",
            "domain": [("facility_contract_id", "=", self.id)],
        }

    @api.model
    def _cron_flag_renewals(self):
        """Flag contracts approaching their end date.

        Renewal is where FM revenue quietly leaks: a contract that lapses
        unnoticed keeps generating work orders and stops generating invoices.
        """
        today = fields.Date.context_today(self)
        due = self.search([
            ("is_amc", "=", True),
            ("renewal_notified", "=", False),
            ("date_end", "!=", False),
            ("date_end", ">=", today),
        ]).filtered(
            lambda c: c.days_to_expiry <= (c.renewal_notice_days or 0))
        for contract in due:
            contract.message_post(body=self.env._(
                "Contract ends in %(days)s day(s) — renewal decision due. "
                "Margin to date: %(margin)s.",
                days=contract.days_to_expiry,
                margin=contract.margin,
            ))
        due.write({"renewal_notified": True})
        return len(due)
