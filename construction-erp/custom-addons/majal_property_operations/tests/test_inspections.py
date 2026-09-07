"""Move-in and move-out inspections, and rent paid by cheque."""

from dateutil.relativedelta import relativedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestLeaseInspections(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.lease"])
        cls.development = cls.env["majal.development"].create(
            {"name": "Inspection Heights", "code": "INSP"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower I", "code": "I", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 1", "number": 1, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "I-0101", "floor_id": cls.floor.id, "status": "available"})
        cls.tenant = cls.env["res.partner"].create({"name": "Inspection Tenant"})
        cls.lease = cls.env["majal.lease"].create({
            "unit_id": cls.unit.id, "tenant_id": cls.tenant.id,
            "start_date": cls.today,
            "end_date": cls.today + relativedelta(years=1, days=-1),
            "annual_rent": 120000, "deposit": 10000,
        })

    def _inspection(self, kind, **vals):
        return self.env["majal.lease.inspection"].create({
            "lease_id": self.lease.id, "inspection_type": kind, **vals})

    def test_a_lease_has_at_most_one_inspection_of_each_kind(self):
        self._inspection("move_in")
        with self.assertRaises(UserError):
            self._inspection("move_in")

    def test_a_move_out_copies_the_move_in_findings(self):
        move_in = self._inspection("move_in")
        self.env["majal.lease.inspection.line"].create({
            "inspection_id": move_in.id, "name": "Oven", "location": "Kitchen",
            "condition_in": "good",
        })
        move_in.action_done()

        move_out = self._inspection("move_out")
        move_out.action_copy_from_move_in()
        self.assertEqual(move_out.line_ids.name, "Oven")
        self.assertEqual(move_out.line_ids.condition_in, "good")

    def test_a_move_out_with_no_move_in_has_nothing_to_compare_against(self):
        move_out = self._inspection("move_out")
        with self.assertRaises(UserError):
            move_out.action_copy_from_move_in()

    def test_fair_wear_and_tear_cannot_be_charged_to_the_deposit(self):
        """A deduction has to be attributed, or a deposit becomes a fee."""
        move_out = self._inspection("move_out")
        with self.assertRaises(UserError):
            self.env["majal.lease.inspection.line"].create({
                "inspection_id": move_out.id, "name": "Worn carpet",
                "condition_out": "fair", "deduction_amount": 500,
            })

    def test_deductions_reduce_the_deposit_refund(self):
        move_out = self._inspection("move_out")
        self.env["majal.lease.inspection.line"].create({
            "inspection_id": move_out.id, "name": "Broken door",
            "condition_out": "damaged", "is_tenant_liable": True,
            "deduction_amount": 2500,
        })
        move_out.invalidate_recordset()
        self.assertEqual(move_out.deduction_total, 2500)
        self.assertEqual(move_out.deposit_refund, 7500)

    def test_the_refund_never_goes_negative(self):
        move_out = self._inspection("move_out")
        self.env["majal.lease.inspection.line"].create({
            "inspection_id": move_out.id, "name": "Gutted kitchen",
            "condition_out": "damaged", "is_tenant_liable": True,
            "deduction_amount": 25000,
        })
        move_out.invalidate_recordset()
        self.assertEqual(move_out.deposit_refund, 0)


@tagged("post_install", "-at_install")
class TestRentCheques(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.lease"])
        cls.development = cls.env["majal.development"].create(
            {"name": "Cheque Rent Heights", "code": "CRH"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower R", "code": "R", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 1", "number": 1, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "R-0101", "floor_id": cls.floor.id, "status": "available"})
        cls.tenant = cls.env["res.partner"].create({"name": "Cheque Tenant"})
        cls.lease = cls.env["majal.lease"].create({
            "unit_id": cls.unit.id, "tenant_id": cls.tenant.id,
            "start_date": cls.today,
            "end_date": cls.today + relativedelta(years=1, days=-1),
            "frequency": "quarterly", "annual_rent": 120000,
        })
        cls.lease.action_generate_rent_schedule()

    def test_clearing_a_rent_cheque_settles_the_instalment(self):
        line = self.lease.rent_line_ids[0]
        cheque = self.env["majal.cheque"].create({
            "name": "R-0001", "partner_id": self.tenant.id,
            "amount": line.amount, "due_date": line.due_date,
            "rent_line_id": line.id,
        })
        cheque.action_clear()
        self.assertEqual(line.amount_paid, line.amount)
        self.assertEqual(line.state, "paid")
        self.assertEqual(cheque.lease_id, self.lease)

    def test_a_bounced_rent_cheque_puts_the_arrears_back(self):
        line = self.lease.rent_line_ids[0]
        cheque = self.env["majal.cheque"].create({
            "name": "R-0002", "partner_id": self.tenant.id,
            "amount": line.amount, "due_date": line.due_date,
            "rent_line_id": line.id,
        })
        cheque.action_clear()
        cheque.action_bounce()
        self.assertEqual(line.amount_paid, 0)
        self.assertEqual(line.state, "pending")
