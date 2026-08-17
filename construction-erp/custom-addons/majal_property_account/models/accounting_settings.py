from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalPropertyAccountingSettings(models.Model):
    _name = "majal.property.accounting.settings"
    _description = "Majal Property Accounting Settings"
    _rec_name = "company_id"

    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="restrict", index=True)
    journal_id = fields.Many2one(
        "account.journal", required=True, string="Sales Journal",
        domain="[('type', '=', 'sale'), ('company_id', '=', company_id)]")
    income_account_id = fields.Many2one(
        "account.account", required=True, string="Sales Income Account",
        domain="[('company_ids', 'in', company_id), ('account_type', 'in', ('income', 'income_other'))]")
    rent_income_account_id = fields.Many2one(
        "account.account", required=True, string="Rent Income Account",
        domain="[('company_ids', 'in', company_id), ('account_type', 'in', ('income', 'income_other'))]")
    service_charge_income_account_id = fields.Many2one(
        "account.account", string="Service Charge Income Account",
        domain="[('company_ids', 'in', company_id), ('account_type', 'in', ('income', 'income_other'))]")

    _sql_constraints = [
        ("company_unique", "unique(company_id)",
         "Only one Property Accounting configuration is allowed per company."),
    ]

    @api.model
    def _get_for_company(self, company):
        settings = self.search([("company_id", "=", company.id)], limit=1)
        if not settings:
            raise UserError(
                self.env._(
                    "Configure Majal Property Accounting for %(company)s before "
                    "creating invoices.", company=company.display_name))
        return settings

    @api.constrains("journal_id", "company_id")
    def _check_journal_company(self):
        for settings in self:
            if settings.journal_id and settings.journal_id.company_id != settings.company_id:
                raise UserError(self.env._("The sales journal must belong to the selected company."))
