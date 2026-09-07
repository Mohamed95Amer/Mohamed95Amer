from odoo import api, fields, models


class ContractRecoverableParts(models.Model):
    """Close the loop the contract could describe but not price.

    A maintenance contract can already say parts are excluded from cover. Until
    parts moved real stock there was no way to say what those excluded parts
    cost, so "parts not included" was a clause with no number behind it. Now
    the value of spares consumed on covered work is exactly what is recoverable
    on top of the fee.
    """

    _inherit = "contract.contract"

    recoverable_parts_value = fields.Monetary(
        compute="_compute_recoverable_parts", currency_field="currency_id",
        string="Recoverable Parts",
        help="Spares consumed on work the contract covers, where the contract "
             "excludes parts.",
    )

    @api.depends("covers_parts", "request_ids.parts_issued_value",
                 "request_ids.contract_covered")
    def _compute_recoverable_parts(self):
        for contract in self:
            if contract.covers_parts:
                contract.recoverable_parts_value = 0.0
                continue
            covered = contract.request_ids.filtered("contract_covered")
            contract.recoverable_parts_value = sum(
                covered.mapped("parts_issued_value"))
