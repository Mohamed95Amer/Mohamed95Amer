"""Service charges and owner statements.

Two rules carry most of the weight: the charges raised from a budget add
up to the budget exactly, because owners compare notes; and a statement
only pays out money that actually arrived.
"""

from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestServiceCharges(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.service.charge"])
        cls.owner = cls.env["res.partner"].create({"name": "Unit Owner"})
        cls.development = cls.env["majal.development"].create(
            {"name": "Service Heights", "code": "SVC"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower S", "code": "S", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 1", "number": 1, "building_id": cls.building.id})
        # Deliberately unequal areas, so allocation by area is visible.
        cls.small = cls.env["majal.unit"].create({
            "name": "S-0101", "floor_id": cls.floor.id,
            "suite_area": 600, "owner_id": cls.owner.id})
        cls.large = cls.env["majal.unit"].create({
            "name": "S-0102", "floor_id": cls.floor.id,
            "suite_area": 1400, "owner_id": cls.owner.id})

    def _budget(self, **vals):
        return self.env["majal.service.charge.budget"].create({
            "development_id": self.development.id,
            "year": self.today.year,
            "line_ids": [
                (0, 0, {"name": "Cleaning", "category": "cleaning", "amount": 60000}),
                (0, 0, {"name": "Security", "category": "security", "amount": 40000}),
            ],
            **vals,
        })

    def test_a_budget_totals_its_cost_lines(self):
        self.assertEqual(self._budget().amount_total, 100000)

    def test_a_budget_must_be_approved_before_owners_are_charged(self):
        budget = self._budget()
        with self.assertRaises(UserError):
            budget.action_generate_charges()

    def test_charges_by_area_follow_the_size_of_the_unit(self):
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()

        small = budget.charge_ids.filtered(lambda c: c.unit_id == self.small)
        large = budget.charge_ids.filtered(lambda c: c.unit_id == self.large)
        self.assertEqual(small.amount, 30000)   # 600 / 2000
        self.assertEqual(large.amount, 70000)   # 1400 / 2000

    def test_the_charges_add_up_to_the_budget_exactly(self):
        """Owners compare notes, so a rounding gap is an argument."""
        budget = self._budget(line_ids=[
            (0, 0, {"name": "Odd cost", "category": "other", "amount": 100001})])
        budget.action_approve()
        budget.action_generate_charges()
        self.assertAlmostEqual(
            sum(budget.charge_ids.mapped("amount")), 100001, places=2)

    def test_equal_allocation_splits_per_unit_not_per_sqft(self):
        budget = self._budget(allocation_method="equal")
        budget.action_approve()
        budget.action_generate_charges()
        self.assertEqual(set(budget.charge_ids.mapped("amount")), {50000})

    def test_recutting_is_refused_once_an_owner_has_paid(self):
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids[0].action_mark_paid()
        with self.assertRaises(UserError):
            budget.action_generate_charges()

    def test_the_charge_carries_the_owner_of_the_unit(self):
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()
        self.assertEqual(set(budget.charge_ids.mapped("partner_id")), {self.owner})

    def test_a_unit_with_no_owner_yet_still_gets_charged(self):
        """Before handover the developer carries it, which is exactly the
        number an owners' association needs to see."""
        self.small.owner_id = False
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()
        unowned = budget.charge_ids.filtered(lambda c: c.unit_id == self.small)
        self.assertFalse(unowned.partner_id)
        self.assertTrue(unowned.amount)

    def test_collection_rate_reports_what_has_come_in(self):
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids.filtered(lambda c: c.unit_id == self.small).action_mark_paid()
        budget.invalidate_recordset()
        self.assertEqual(budget.amount_collected, 30000)
        self.assertEqual(round(budget.collection_rate), 30)

    def test_overdue_charges_are_searchable(self):
        budget = self._budget()
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids.write({"due_date": self.today - timedelta(days=10)})
        overdue = self.env["majal.service.charge"].search([("is_overdue", "=", True)])
        self.assertEqual(len(overdue), 2)


@tagged("post_install", "-at_install")
class TestOwnerStatements(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.owner.statement"])
        cls.owner = cls.env["res.partner"].create({"name": "Statement Owner"})
        cls.development = cls.env["majal.development"].create(
            {"name": "Statement Heights", "code": "STM"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower T", "code": "T", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 1", "number": 1, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "T-0101", "floor_id": cls.floor.id,
            "suite_area": 1000, "owner_id": cls.owner.id})

    def _statement(self, **vals):
        return self.env["majal.owner.statement"].create({
            "partner_id": self.owner.id,
            "date_from": self.today - timedelta(days=90),
            "date_to": self.today,
            "commission_rate": 5.0,
            **vals,
        })

    def test_a_statement_gets_a_reference(self):
        self.assertNotEqual(self._statement().name, "/")

    def test_a_statement_for_an_owner_with_no_units_is_refused(self):
        stranger = self.env["res.partner"].create({"name": "Owns Nothing"})
        with self.assertRaises(UserError):
            self._statement(partner_id=stranger.id).action_gather()

    def test_service_charges_in_the_period_are_deducted(self):
        budget = self.env["majal.service.charge.budget"].create({
            "development_id": self.development.id,
            "year": self.today.year,
            "line_ids": [(0, 0, {"name": "Cleaning", "amount": 12000})],
        })
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids.write({"due_date": self.today})

        statement = self._statement()
        statement.action_gather()
        self.assertEqual(statement.amount_deductions, 12000)
        self.assertEqual(statement.amount_net, -12000)

    def test_an_empty_statement_cannot_be_confirmed(self):
        statement = self._statement()
        with self.assertRaises(UserError):
            statement.action_confirm()

    def test_a_statement_is_confirmed_before_it_is_paid_out(self):
        budget = self.env["majal.service.charge.budget"].create({
            "development_id": self.development.id, "year": self.today.year,
            "line_ids": [(0, 0, {"name": "Cleaning", "amount": 1000})],
        })
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids.write({"due_date": self.today})

        statement = self._statement()
        statement.action_gather()
        with self.assertRaises(UserError):
            statement.action_mark_paid()
        statement.action_confirm()
        statement.action_mark_paid()
        self.assertEqual(statement.state, "paid")
        self.assertTrue(statement.payment_date)

    def test_a_paid_statement_cannot_be_cancelled_or_reopened(self):
        budget = self.env["majal.service.charge.budget"].create({
            "development_id": self.development.id, "year": self.today.year,
            "line_ids": [(0, 0, {"name": "Cleaning", "amount": 1000})],
        })
        budget.action_approve()
        budget.action_generate_charges()
        budget.charge_ids.write({"due_date": self.today})
        statement = self._statement()
        statement.action_gather()
        statement.action_confirm()
        statement.action_mark_paid()
        with self.assertRaises(UserError):
            statement.action_cancel()
        with self.assertRaises(UserError):
            statement.action_reset_to_draft()
