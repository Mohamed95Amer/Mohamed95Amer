from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestChangeOrder(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Not a test of approvals: the suite ships demo approval rules,
        # and leaving them on turns every fixture that approves a bill
        # or a variation into a test of the approval engine.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.project = cls.env["project.project"].create(
            {"name": "CO Test", "is_construction": True})
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id})
        cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id, "name": "Base item",
            "quantity": 100, "unit_rate": 1000})   # contract 100,000
        cls.boq.action_approve()
        cls.boq.action_lock()

    def _co(self, change_type="addition"):
        return self.env["construction.change.order"].create({
            "name": "VO test",
            "project_id": self.project.id,
            "boq_id": self.boq.id,
            "change_type": change_type,
            "line_ids": [
                (0, 0, {"name": "Extra work", "quantity": 10,
                        "unit_rate": 500, "unit_cost": 300}),
            ],
        })

    def test_totals(self):
        co = self._co()
        self.assertEqual(co.amount_sell_total, 5000)
        self.assertEqual(co.amount_cost_total, 3000)

    def test_omission_is_negative(self):
        co = self._co("omission")
        self.assertEqual(co.amount_sell_total, -5000)

    def test_approve_appends_variation_to_locked_boq(self):
        contract_before = self.boq.amount_sell_total
        self.assertEqual(contract_before, 100000)
        co = self._co()
        co.action_submit()
        co.action_approve()
        self.assertEqual(co.state, "approved")
        self.assertTrue(co.boq_section_id)
        # BOQ contract grew by the variation, even though it was locked
        self.assertEqual(self.boq.amount_sell_total, 105000)
        self.assertEqual(self.boq.amount_variation_total, 5000)
        variation_lines = self.boq.line_ids.filtered("is_variation")
        self.assertEqual(len(variation_lines), 1)
        self.assertEqual(variation_lines.quantity, 10)

    def test_omission_reduces_contract(self):
        co = self._co("omission")
        co.action_submit()
        co.action_approve()
        # omission posts negative quantity -> contract reduced
        self.assertEqual(self.boq.amount_sell_total, 95000)

    def test_cannot_approve_draft(self):
        co = self._co()
        with self.assertRaises(UserError):
            co.action_approve()

    def test_submit_requires_lines(self):
        co = self.env["construction.change.order"].create({
            "name": "empty", "project_id": self.project.id,
            "boq_id": self.boq.id})
        with self.assertRaises(UserError):
            co.action_submit()

    def test_rfi_raises_change_event(self):
        rfi = self.env["construction.rfi"].create({
            "name": "Clash", "project_id": self.project.id,
            "question": "<p>?</p>", "cost_impact": True})
        action = rfi.action_raise_change_event()
        event = self.env["construction.change.event"].browse(action["res_id"])
        self.assertEqual(event.source_rfi_id, rfi)
        self.assertEqual(event.origin, "rfi")
        self.assertEqual(rfi.change_event_count, 1)

    def test_change_event_creates_co(self):
        event = self.env["construction.change.event"].create({
            "name": "New scope", "project_id": self.project.id,
            "origin": "client_request"})
        action = event.action_create_change_order()
        co = self.env["construction.change.order"].browse(action["res_id"])
        self.assertEqual(co.change_event_id, event)
        self.assertEqual(co.boq_id, self.boq)
        self.assertEqual(event.state, "converted")
