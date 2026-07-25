from odoo import api, fields, models


class ProjectProjectCvr(models.Model):
    """Cost Value Reconciliation on the project record.

    A CVR is the monthly commercial control every contractor runs: it puts the
    value earned so far next to the cost incurred to earn it, and compares the
    result with the margin the job was won on. The suite already captures every
    input — the BOQ carries budget and sell rates (variations included, since an
    approved change order appends its lines to the BOQ), interim payment
    certificates carry the value certified by the consultant, and subcontracts
    carry what has been committed and certified to subcontractors. This model
    only reconciles them; it stores no new commercial data of its own.

    Everything is computed rather than stored: the inputs move whenever a claim
    is certified or a variation is approved, and a stale CVR is worse than none.
    """

    _inherit = "project.project"

    # Inverse relations exist so the CVR computes can declare real
    # dependencies: without them Odoo cannot know that awarding a subcontract
    # or certifying a claim changes a project's commercial position, and the
    # figures would go stale inside a transaction.
    cvr_boq_ids = fields.One2many(
        "construction.boq", "project_id", string="Bills of Quantities"
    )
    cvr_subcontract_ids = fields.One2many(
        "construction.subcontract", "project_id", string="Subcontracts"
    )
    cvr_claim_ids = fields.One2many(
        "construction.progress.claim", "project_id", string="Payment Certificates"
    )

    # --- Value (what the client owes us) -------------------------------------
    cvr_boq_id = fields.Many2one(
        "construction.boq",
        compute="_compute_cvr",
        string="Priced BOQ",
        help="Latest non-draft Bill of Quantities used as the CVR baseline.",
    )
    cvr_contract_value = fields.Monetary(
        compute="_compute_cvr",
        search="_search_cvr_contract_value",
        currency_field="currency_id",
        string="Contract Value",
        help="BOQ sell total, including approved variations.",
    )
    cvr_certified_value = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Certified to Date",
        help="Cumulative work done certified on the latest interim payment "
             "certificate.",
    )
    cvr_percent_complete = fields.Float(
        compute="_compute_cvr",
        string="% Certified",
        help="Certified value as a share of the contract value.",
    )

    # --- Cost (what it takes to earn that value) -----------------------------
    cvr_budget_cost = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Budget Cost",
        help="Estimated cost of the whole works, from the BOQ cost breakdown.",
    )
    cvr_committed_cost = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Committed Cost",
        help="Value of awarded (confirmed) subcontracts — cost already tied up "
             "in commitments, whether or not the work has been done.",
    )
    cvr_cost_to_date = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Cost to Date",
        help="Gross value certified to subcontractors so far.",
    )
    cvr_uncommitted_budget = fields.Monetary(
        compute="_compute_cvr",
        search="_search_cvr_uncommitted_budget",
        currency_field="currency_id",
        string="Uncommitted Budget",
        help="Budget cost not yet tied to a subcontract. Negative means the "
             "commitments already exceed the budget.",
    )

    # --- Margin --------------------------------------------------------------
    cvr_earned_margin = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Earned Margin",
        help="Certified value less cost to date — the margin actually realised "
             "so far.",
    )
    cvr_earned_margin_percent = fields.Float(
        compute="_compute_cvr", string="Earned Margin %"
    )
    cvr_forecast_margin = fields.Monetary(
        compute="_compute_cvr",
        currency_field="currency_id",
        string="Forecast Final Margin",
        help="Contract value less the expected final cost, where the expected "
             "cost is what has been committed plus the budget for work not yet "
             "let — so a package awarded above its own allowance erodes the "
             "forecast immediately, not only once total commitments pass the "
             "total budget.",
    )
    cvr_forecast_margin_percent = fields.Float(
        compute="_compute_cvr", string="Forecast Margin %"
    )
    cvr_margin_variance = fields.Monetary(
        compute="_compute_cvr",
        search="_search_cvr_margin_variance",
        currency_field="currency_id",
        string="Margin Movement",
        help="Forecast final margin against the margin the job was priced at. "
             "Negative means the job is eroding.",
    )

    @api.depends(
        "cvr_boq_ids.state",
        "cvr_boq_ids.version",
        "cvr_boq_ids.amount_sell_total",
        "cvr_boq_ids.amount_cost_total",
        "cvr_subcontract_ids.state",
        "cvr_subcontract_ids.amount_total",
        "cvr_subcontract_ids.amount_certified",
        "cvr_subcontract_ids.line_ids.boq_line_id",
        "cvr_subcontract_ids.line_ids.boq_line_id.amount_cost",
        "cvr_claim_ids.state",
        "cvr_claim_ids.sequence_no",
        "cvr_claim_ids.amount_work_done_cumulative",
    )
    def _compute_cvr(self):
        boq_model = self.env["construction.boq"]
        claim_model = self.env["construction.progress.claim"]
        subcontract_model = self.env["construction.subcontract"]

        for project in self:
            # Baseline: the latest priced BOQ. Draft BOQs are excluded — an
            # unapproved bill is not a commercial baseline.
            boq = boq_model.search(
                [("project_id", "=", project.id), ("state", "!=", "draft")],
                order="version desc, id desc",
                limit=1,
            )
            project.cvr_boq_id = boq
            contract_value = boq.amount_sell_total if boq else 0.0
            budget_cost = boq.amount_cost_total if boq else 0.0

            # Value certified: the newest certificate carries the cumulative
            # figure, so only the latest one is read.
            latest_claim = claim_model.search(
                [
                    ("project_id", "=", project.id),
                    ("state", "in", ["certified", "invoiced", "paid"]),
                ],
                order="sequence_no desc, id desc",
                limit=1,
            )
            certified_value = (
                latest_claim.amount_work_done_cumulative if latest_claim else 0.0
            )

            subcontracts = subcontract_model.search(
                [("project_id", "=", project.id), ("state", "!=", "draft")]
            )
            committed_cost = sum(subcontracts.mapped("amount_total"))
            cost_to_date = sum(subcontracts.mapped("amount_certified"))

            # Expected final cost, the honest way round: what has been
            # committed, plus the budget for work not yet let.
            #
            # Comparing total committed against total budget hides the case
            # that matters. A package let above its own allowance only shows up
            # once commitments exceed the entire budget, which happens near the
            # end of a job when almost everything is let and it is far too late
            # to act. Subcontract lines name the BOQ item they cover, so the
            # budget they replace can be taken out and the overspend appears on
            # the first package.
            covered_budget = sum(
                subcontracts.mapped("line_ids.boq_line_id").mapped("amount_cost")
            )
            if covered_budget:
                expected_final_cost = committed_cost + (budget_cost - covered_budget)
            else:
                # Commitments that do not say which bill items they cover
                # cannot be netted off; fall back to the cruder comparison
                # rather than double-counting the budget they replace.
                expected_final_cost = max(budget_cost, committed_cost)

            project.cvr_contract_value = contract_value
            project.cvr_budget_cost = budget_cost
            project.cvr_certified_value = certified_value
            project.cvr_committed_cost = committed_cost
            project.cvr_cost_to_date = cost_to_date
            project.cvr_uncommitted_budget = budget_cost - committed_cost
            project.cvr_percent_complete = (
                (certified_value / contract_value * 100.0) if contract_value else 0.0
            )

            earned_margin = certified_value - cost_to_date
            project.cvr_earned_margin = earned_margin
            project.cvr_earned_margin_percent = (
                (earned_margin / certified_value * 100.0) if certified_value else 0.0
            )

            forecast_margin = contract_value - expected_final_cost
            project.cvr_forecast_margin = forecast_margin
            project.cvr_forecast_margin_percent = (
                (forecast_margin / contract_value * 100.0) if contract_value else 0.0
            )
            # Margin the job was priced at, before any commitment overspend.
            tendered_margin = contract_value - budget_cost
            project.cvr_margin_variance = forecast_margin - tendered_margin

    # --- Searching -----------------------------------------------------------
    #
    # The CVR figures are deliberately not stored (see the class docstring), so
    # they need explicit search support to be filterable. Each search computes
    # the field across construction projects and resolves the operator in
    # Python. Project counts are small — hundreds at most, one row per job — so
    # this stays well inside what a filter can afford, and it keeps the numbers
    # honest instead of trading correctness for an indexable column.
    OPERATORS = {
        "<": lambda a, b: a < b,
        "<=": lambda a, b: a <= b,
        ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b,
        "=": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
    }

    def _search_cvr_field(self, field_name, operator, value):
        compare = self.OPERATORS.get(operator)
        if compare is None:
            raise NotImplementedError(
                self.env._("Unsupported operator %s on %s", operator, field_name)
            )
        projects = self.search([("is_construction", "=", True)])
        matching = projects.filtered(lambda p: compare(p[field_name], value))
        return [("id", "in", matching.ids)]

    def _search_cvr_contract_value(self, operator, value):
        return self._search_cvr_field("cvr_contract_value", operator, value)

    def _search_cvr_uncommitted_budget(self, operator, value):
        return self._search_cvr_field("cvr_uncommitted_budget", operator, value)

    def _search_cvr_margin_variance(self, operator, value):
        return self._search_cvr_field("cvr_margin_variance", operator, value)

    def action_open_cvr(self):
        """Open the commercial position of the selected projects."""
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Cost Value Reconciliation"),
            "res_model": "project.project",
            "domain": [("is_construction", "=", True)],
            "views": [
                [self.env.ref("construction_report.view_project_cvr_list").id, "list"],
                [self.env.ref("construction_report.view_project_cvr_form").id, "form"],
            ],
            "target": "current",
        }
