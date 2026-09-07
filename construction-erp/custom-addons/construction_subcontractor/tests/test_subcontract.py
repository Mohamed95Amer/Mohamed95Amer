from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestSubcontract(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.sub = cls.env["res.partner"].create({"name": "Delta MEP"})
        cls.project = cls.env["project.project"].create(
            {"name": "Sub Test", "is_construction": True})
        cls.sc = cls.env["construction.subcontract"].create({
            "name": "HVAC", "project_id": cls.project.id,
            "subcontractor_id": cls.sub.id,
            "retention_percent": 10.0, "retention_cap_percent": 5.0,
            "line_ids": [
                (0, 0, {"name": "Ductwork", "quantity": 1, "unit_rate": 200000}),
                (0, 0, {"name": "FCUs", "quantity": 1, "unit_rate": 100000}),
            ],
        })
        cls.sc.action_confirm()  # value 300,000

    def _payment(self):
        return self.env["construction.subcontract.payment"].create(
            {"subcontract_id": self.sc.id})

    def test_subcontract_value(self):
        self.assertEqual(self.sc.amount_total, 300000)
        self.assertEqual(self.sc.state, "confirmed")

    def test_payment_populates_and_computes(self):
        pay = self._payment()
        self.assertEqual(len(pay.line_ids), 2)
        self.assertEqual(pay.sequence_no, 1)
        self.assertIn("-SPC-", pay.reference)
        # certify 50% of ductwork -> 100,000 gross
        pay.line_ids.filtered(
            lambda l: l.subcontract_line_id.name == "Ductwork"
        ).qty_this_period = 0.5
        self.assertEqual(pay.gross_cumulative, 100000)
        # retention 10% = 10,000 (cap 5% of 300,000 = 15,000)
        self.assertEqual(pay.retention_cumulative, 10000)
        self.assertEqual(pay.amount_due, 90000)

    def test_backcharge_reduces_payable(self):
        pay = self._payment()
        pay.line_ids.filtered(
            lambda l: l.subcontract_line_id.name == "Ductwork"
        ).qty_this_period = 0.5
        defect = self.env["construction.defect"].create(
            {"name": "Bad duct", "project_id": self.project.id})
        self.env["construction.subcontract.backcharge"].create({
            "payment_id": pay.id, "name": "Rework defective duct",
            "defect_id": defect.id, "amount": 5000})
        # net = 100,000 gross - 10,000 retention - 5,000 backcharge = 85,000
        self.assertEqual(pay.backcharge_this, 5000)
        self.assertEqual(pay.amount_due, 85000)

    def test_incremental_payment(self):
        p1 = self._payment()
        p1.line_ids.filtered(
            lambda l: l.subcontract_line_id.name == "Ductwork"
        ).qty_this_period = 0.5
        p1.action_submit()
        p1.action_certify()
        p2 = self._payment()
        self.assertEqual(p2.sequence_no, 2)
        line = p2.line_ids.filtered(
            lambda l: l.subcontract_line_id.name == "Ductwork")
        self.assertEqual(line.qty_previous, 0.5)
        line.qty_this_period = 0.5  # complete ductwork -> cumulative 200,000
        # p1: gross 100k, retention 10k. p2 cumulative gross 200k; retention
        # 10% = 20k but capped at 5% of 300k = 15k. retention_this = 5k.
        # due this = gross_this 100k - retention_this 5k = 95,000
        self.assertEqual(p2.retention_cumulative, 15000)
        self.assertEqual(p2.amount_due, 95000)

    def test_create_vendor_bill(self):
        pay = self._payment()
        pay.line_ids.filtered(
            lambda l: l.subcontract_line_id.name == "Ductwork"
        ).qty_this_period = 0.5
        pay.action_submit()
        pay.action_certify()
        pay.action_create_bill()
        move = pay.move_id
        self.assertTrue(move)
        self.assertEqual(move.move_type, "in_invoice")
        self.assertEqual(move.partner_id, self.sub)
        self.assertEqual(move.amount_untaxed, 90000)  # net of retention
        self.assertEqual(pay.state, "billed")

    def test_bill_requires_certified(self):
        pay = self._payment()
        with self.assertRaises(UserError):
            pay.action_create_bill()
