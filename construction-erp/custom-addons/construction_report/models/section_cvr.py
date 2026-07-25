from odoo import api, fields, models


class ConstructionBoqSectionCvr(models.Model):
    """Commercial position of one section of the bill.

    A project-level CVR says the job is losing money; it cannot say where. On a
    tower that is the difference between a substructure that overran once and a
    finishes package bleeding every month, and they call for different action.
    Sections are the natural unit — they are how the bill was priced and how
    packages are let — so the same value-against-cost reconciliation is run per
    section.
    """

    _inherit = "construction.boq.section"

    cvr_contract_value = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Section Value")
    cvr_budget_cost = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Budget Cost")
    cvr_certified_value = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Certified")
    cvr_committed_cost = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Committed",
        help="Subcontract value against bill items in this section.")
    cvr_percent_complete = fields.Float(
        compute="_compute_section_cvr", string="% Certified")
    cvr_forecast_margin = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Forecast Margin")
    cvr_forecast_margin_percent = fields.Float(
        compute="_compute_section_cvr", string="Forecast Margin %")
    cvr_margin_variance = fields.Monetary(
        compute="_compute_section_cvr", currency_field="currency_id",
        string="Margin Movement",
        help="Forecast margin against the margin this section was priced at. "
             "Negative means this part of the job is eroding.")

    @api.depends(
        "line_ids.amount_sell",
        "line_ids.amount_cost",
        "line_ids.amount_certified",
        "line_ids.subcontract_line_ids.subcontract_id.state",
        "line_ids.subcontract_line_ids.amount",
    )
    def _compute_section_cvr(self):
        for section in self:
            lines = section.line_ids
            contract_value = sum(lines.mapped("amount_sell"))
            budget_cost = sum(lines.mapped("amount_cost"))
            certified_value = sum(lines.mapped("amount_certified"))

            # Commitments that name a bill item in this section.
            committed_lines = lines.mapped("subcontract_line_ids").filtered(
                lambda line: line.subcontract_id.state != "draft"
            )
            committed_cost = sum(committed_lines.mapped("amount"))
            covered_budget = sum(
                committed_lines.mapped("boq_line_id").mapped("amount_cost")
            )
            # Same cost-to-complete logic as the project CVR: what is committed,
            # plus the budget for the part of this section not yet let.
            expected_final_cost = (
                committed_cost + (budget_cost - covered_budget)
                if covered_budget else max(budget_cost, committed_cost)
            )

            section.cvr_contract_value = contract_value
            section.cvr_budget_cost = budget_cost
            section.cvr_certified_value = certified_value
            section.cvr_committed_cost = committed_cost
            section.cvr_percent_complete = (
                (certified_value / contract_value * 100.0) if contract_value else 0.0
            )
            forecast_margin = contract_value - expected_final_cost
            section.cvr_forecast_margin = forecast_margin
            section.cvr_forecast_margin_percent = (
                (forecast_margin / contract_value * 100.0) if contract_value else 0.0
            )
            section.cvr_margin_variance = forecast_margin - (
                contract_value - budget_cost
            )


class ConstructionBoqLineSubcontractLink(models.Model):
    """Inverse from a bill item to the subcontract lines that cover it.

    Needed so a section can find its commitments — and so the compute can
    declare a dependency on them rather than going stale when a package is
    awarded.
    """

    _inherit = "construction.boq.line"

    subcontract_line_ids = fields.One2many(
        "construction.subcontract.line", "boq_line_id",
        string="Subcontract Lines")
