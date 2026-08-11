from odoo import fields, models
from odoo.exceptions import UserError


class MajalPaymentInstallmentAccounting(models.Model):
    _inherit = "majal.payment.installment"

    invoice_id = fields.Many2one(
        "account.move", string="Invoice", readonly=True, copy=False,
        ondelete="restrict", domain="[('move_type', '=', 'out_invoice')]")
    invoice_state = fields.Selection(
        related="invoice_id.state", string="Invoice State", readonly=True)
    invoice_payment_state = fields.Selection(
        related="invoice_id.payment_state", string="Payment State", readonly=True)

    def _get_property_invoice_settings(self):
        self.ensure_one()
        return self.env["majal.property.accounting.settings"]._get_for_company(
            self.company_id or self.env.company)

    def action_create_invoice(self):
        for installment in self:
            if installment.invoice_id:
                continue
            if not installment.partner_id:
                raise UserError(self.env._("An installment needs a buyer before invoicing."))
            amount = installment.amount_residual
            if amount <= 0:
                raise UserError(self.env._("There is no residual amount to invoice."))
            settings = installment._get_property_invoice_settings()
            move = self.env["account.move"].create({
                "move_type": "out_invoice",
                "partner_id": installment.partner_id.id,
                "company_id": settings.company_id.id,
                "journal_id": settings.journal_id.id,
                "invoice_date": installment.due_date,
                "currency_id": installment.currency_id.id,
                "ref": installment.name,
                "invoice_line_ids": [(0, 0, {
                    "name": "%s — %s" % (
                        installment.reservation_id.display_name,
                        installment.name,
                    ),
                    "quantity": 1,
                    "price_unit": amount,
                    "account_id": settings.income_account_id.id,
                })],
            })
            installment.invoice_id = move.id
        return self.action_open_invoice()

    def action_open_invoice(self):
        self.ensure_one()
        if not self.invoice_id:
            return self.action_create_invoice()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Property Invoice"),
            "res_model": "account.move",
            "res_id": self.invoice_id.id,
            "view_mode": "form",
        }


class MajalLeaseRentLineAccounting(models.Model):
    _inherit = "majal.lease.rent.line"

    invoice_id = fields.Many2one(
        "account.move", string="Invoice", readonly=True, copy=False,
        ondelete="restrict", domain="[('move_type', '=', 'out_invoice')]")
    invoice_state = fields.Selection(
        related="invoice_id.state", string="Invoice State", readonly=True)
    invoice_payment_state = fields.Selection(
        related="invoice_id.payment_state", string="Payment State", readonly=True)

    def action_create_invoice(self):
        for line in self:
            if line.invoice_id:
                continue
            if not line.tenant_id:
                raise UserError(self.env._("A rent line needs a tenant before invoicing."))
            amount = line.amount_residual
            if amount <= 0:
                raise UserError(self.env._("There is no residual rent amount to invoice."))
            settings = self.env["majal.property.accounting.settings"]._get_for_company(
                line.company_id or self.env.company)
            move = self.env["account.move"].create({
                "move_type": "out_invoice",
                "partner_id": line.tenant_id.id,
                "company_id": settings.company_id.id,
                "journal_id": settings.journal_id.id,
                "invoice_date": line.due_date,
                "currency_id": line.currency_id.id,
                "ref": line.name,
                "invoice_line_ids": [(0, 0, {
                    "name": "%s — %s" % (line.lease_id.display_name, line.name),
                    "quantity": 1,
                    "price_unit": amount,
                    "account_id": settings.rent_income_account_id.id,
                })],
            })
            line.invoice_id = move.id
        return self.action_open_invoice()

    def action_open_invoice(self):
        self.ensure_one()
        if not self.invoice_id:
            return self.action_create_invoice()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Rent Invoice"),
            "res_model": "account.move",
            "res_id": self.invoice_id.id,
            "view_mode": "form",
        }


class MajalServiceChargeAccounting(models.Model):
    _inherit = "majal.service.charge"

    invoice_id = fields.Many2one(
        "account.move", string="Invoice", readonly=True, copy=False,
        ondelete="restrict", domain="[('move_type', '=', 'out_invoice')]")
    invoice_state = fields.Selection(
        related="invoice_id.state", string="Invoice State", readonly=True)
    invoice_payment_state = fields.Selection(
        related="invoice_id.payment_state", string="Payment State", readonly=True)

    def action_create_invoice(self):
        for charge in self:
            if charge.invoice_id:
                continue
            if not charge.partner_id:
                raise UserError(self.env._("A service charge needs an owner before invoicing."))
            amount = charge.amount_residual
            if amount <= 0:
                raise UserError(self.env._("There is no residual service charge to invoice."))
            settings = self.env["majal.property.accounting.settings"]._get_for_company(
                charge.company_id or self.env.company)
            account = settings.service_charge_income_account_id or settings.income_account_id
            move = self.env["account.move"].create({
                "move_type": "out_invoice",
                "partner_id": charge.partner_id.id,
                "company_id": settings.company_id.id,
                "journal_id": settings.journal_id.id,
                "invoice_date": charge.due_date,
                "currency_id": charge.currency_id.id,
                "ref": charge.display_name,
                "invoice_line_ids": [(0, 0, {
                    "name": self.env._("Service charge %(year)s — %(unit)s",
                                       year=charge.year, unit=charge.unit_id.display_name),
                    "quantity": 1,
                    "price_unit": amount,
                    "account_id": account.id,
                })],
            })
            charge.invoice_id = move.id
        return self.action_open_invoice()

    def action_open_invoice(self):
        self.ensure_one()
        if not self.invoice_id:
            return self.action_create_invoice()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Service Charge Invoice"),
            "res_model": "account.move",
            "res_id": self.invoice_id.id,
            "view_mode": "form",
        }
