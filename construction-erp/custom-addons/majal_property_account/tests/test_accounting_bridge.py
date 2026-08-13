from odoo.exceptions import UserError
from odoo.tests import tagged
from odoo.tests.common import TransactionCase


@tagged("at_install", "-post_install")
class TestPropertyAccountingBridge(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.installment = cls.env.ref("majal_real_estate.demo_installment_2")
        cls.Settings = cls.env["majal.property.accounting.settings"]

    def test_missing_configuration_fails_safely(self):
        self.assertFalse(self.Settings.search([("company_id", "=", self.env.company.id)]))
        with self.assertRaises(UserError):
            self.installment.action_create_invoice()

    def test_creates_a_draft_invoice_from_installment(self):
        if self.installment.invoice_id:
            self.skipTest("The demo instalment already has an invoice.")
        journal = self.env["account.journal"].search([
            ("type", "=", "sale"),
            ("company_id", "=", self.env.company.id),
        ], limit=1)
        income = self.env["account.account"].search([
            ("company_ids", "in", self.env.company.id),
            ("account_type", "in", ("income", "income_other")),
        ], limit=1)
        if not journal or not income:
            self.skipTest("The database has no sales journal or income account configured.")
        self.Settings.create({
            "journal_id": journal.id,
            "income_account_id": income.id,
            "rent_income_account_id": income.id,
        })
        self.installment.action_create_invoice()
        self.assertTrue(self.installment.invoice_id)
        self.assertEqual(self.installment.invoice_id.state, "draft")
        self.assertEqual(self.installment.invoice_id.move_type, "out_invoice")
        self.assertEqual(self.installment.invoice_id.amount_total, self.installment.amount_residual)
