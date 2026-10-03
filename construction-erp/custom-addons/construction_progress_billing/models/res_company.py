from odoo import fields, models


class ResCompany(models.Model):
    _inherit = "res.company"

    construction_retention_account_id = fields.Many2one(
        "account.account",
        string="Retention Receivable Account",
        help="Account where retention withheld on progress claims is booked "
        "until release. Auto-created on first use if left empty.")

    def _construction_retention_account(self):
        """Return (creating if needed) the retention receivable account."""
        self.ensure_one()
        if self.construction_retention_account_id:
            return self.construction_retention_account_id
        account = self.env["account.account"].search(
            [("company_ids", "in", self.id), ("code", "=like", "RETEN%")],
            limit=1)
        if not account:
            account = self.env["account.account"].with_company(self).create({
                "name": "Retention Receivable",
                "code": "RETEN",
                "account_type": "asset_receivable",
                "reconcile": True,
                "company_ids": [(6, 0, [self.id])],
            })
        self.construction_retention_account_id = account
        return account


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    construction_retention_account_id = fields.Many2one(
        related="company_id.construction_retention_account_id", readonly=False)
