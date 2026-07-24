from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestProgressClaim(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.client = cls.env["res.partner"].create({"name": "Employer LLC"})
        cls.project = cls.env["project.project"].create({
            "name": "Billing Test",
            "is_construction": True,
            "client_id": cls.client.id,
            "retention_percent": 10.0,
            "retention_cap_percent": 5.0,
        })
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id})
        cls.l1 = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Excavation",
            "quantity": 1000, "unit_rate": 100})   # 100,000
        cls.l2 = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Concrete",
            "quantity": 500, "unit_rate": 400})     # 200,000
        cls.boq.action_approve()   # contract = 300,000

    def _claim(self):
        return self.env["construction.progress.claim"].create({
            "project_id": self.project.id, "boq_id": self.boq.id})

    def test_lines_populated_from_boq(self):
        claim = self._claim()
        self.assertEqual(len(claim.line_ids), 2)
        self.assertEqual(claim.sequence_no, 1)
        self.assertEqual(claim.retention_percent, 10.0)
        self.assertIn("-IPC-", claim.reference)

    def test_amounts_and_retention_cap(self):
        claim = self._claim()
        # Certify 50% of each line -> work done 150,000
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l1).qty_this_period = 500
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l2).qty_this_period = 250
        self.assertEqual(claim.amount_work_done_cumulative, 150000)
        # retention 10% = 15,000 but cap 5% of 300,000 = 15,000 -> equal
        self.assertEqual(claim.retention_cumulative, 15000)
        self.assertEqual(claim.amount_due, 135000)

    def test_retention_cap_binds(self):
        claim = self._claim()
        # 100% work done -> 10% retention = 30,000 but capped at 5% = 15,000
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l1).qty_this_period = 1000
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l2).qty_this_period = 500
        self.assertEqual(claim.amount_work_done_cumulative, 300000)
        self.assertEqual(claim.retention_cumulative, 15000)  # capped
        self.assertEqual(claim.amount_due, 285000)

    def test_second_claim_is_incremental(self):
        c1 = self._claim()
        c1.line_ids.filtered(lambda l: l.boq_line_id == self.l1).qty_this_period = 500
        c1.action_submit()
        c1.action_certify()
        self.assertEqual(self.l1.qty_certified, 500)
        c2 = self._claim()
        self.assertEqual(c2.sequence_no, 2)
        self.assertEqual(c2.previous_claim_id, c1)
        line1 = c2.line_ids.filtered(lambda l: l.boq_line_id == self.l1)
        self.assertEqual(line1.qty_previous, 500)  # carried from c1
        line1.qty_this_period = 500  # complete l1
        self.assertEqual(line1.qty_cumulative, 1000)
        # c1 work=50,000 ret=5,000 due=45,000; c2 cumulative work=100,000
        # ret cumulative=10,000 -> due this = (100k-10k) - (50k-5k) = 45,000
        self.assertEqual(c2.amount_due, 45000)

    def test_certify_updates_boq(self):
        claim = self._claim()
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l2).qty_this_period = 250
        claim.action_submit()
        claim.action_certify()
        self.assertEqual(self.l2.qty_certified, 250)
        self.assertEqual(self.l2.percent_complete, 50)

    def test_invoice_creation_with_retention(self):
        claim = self._claim()
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l1).qty_this_period = 500
        claim.line_ids.filtered(lambda l: l.boq_line_id == self.l2).qty_this_period = 250
        claim.action_submit()
        claim.action_certify()
        claim.action_create_invoice()
        move = claim.move_id
        self.assertTrue(move)
        self.assertEqual(move.move_type, "out_invoice")
        self.assertEqual(move.partner_id, self.client)
        # net certified this period: 150,000 work - 15,000 retention = 135,000
        self.assertEqual(move.amount_untaxed, 135000)
        self.assertEqual(claim.retention_this, 15000)
        self.assertEqual(claim.state, "invoiced")

    def test_invoice_requires_certified(self):
        claim = self._claim()
        with self.assertRaises(UserError):
            claim.action_create_invoice()

    def test_invoice_requires_client(self):
        self.project.client_id = False
        claim = self._claim()
        claim.line_ids[0].qty_this_period = 10
        claim.action_submit()
        claim.action_certify()
        with self.assertRaises(UserError):
            claim.action_create_invoice()
