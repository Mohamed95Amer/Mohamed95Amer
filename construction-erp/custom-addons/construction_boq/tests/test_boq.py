from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestBoq(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "BOQ Test Project", "is_construction": True}
        )
        # These test locking and revisions, not approvals. The module ships
        # demo approval rules, and leaving them on would make every one of
        # them a test of the approval engine instead.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id}
        )
        cls.section = cls.env["construction.boq.section"].create(
            {"boq_id": cls.boq.id, "name": "Concrete", "code": "01"}
        )
        cls.line = cls.env["construction.boq.line"].create(
            {
                "boq_id": cls.boq.id,
                "section_id": cls.section.id,
                "name": "RC Slab",
                "quantity": 100,
                "unit_rate": 500,
                "cost_material": 250,
                "cost_labour": 100,
            }
        )

    def test_totals(self):
        self.assertEqual(self.line.unit_cost, 350)
        self.assertEqual(self.line.amount_sell, 50000)
        self.assertEqual(self.line.amount_cost, 35000)
        self.assertEqual(self.boq.amount_sell_total, 50000)
        self.assertEqual(self.boq.amount_cost_total, 35000)
        self.assertEqual(self.boq.margin_percent, 30)
        self.assertEqual(self.section.amount_sell, 50000)

    def test_lock_blocks_edits(self):
        self.boq.action_approve()
        self.boq.action_lock()
        with self.assertRaises(UserError):
            self.line.write({"unit_rate": 999})

    def test_direct_state_write_is_blocked(self):
        user = self.env["res.users"].create({
            "name": "regular", "login": "regular@majal.test",
            "email": "regular@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [
                self.env.ref("base.group_user").id,
                self.env.ref("construction_base.group_construction_commercial").id,
            ])],
        })
        with self.assertRaises(AccessError):
            self.boq.with_user(user).write({"state": "approved"})
        self.assertEqual(self.boq.state, "draft")

    def test_new_revision_copies_structure(self):
        self.boq.action_approve()
        self.boq.action_new_revision()
        new = self.env["construction.boq"].search(
            [("previous_version_id", "=", self.boq.id)]
        )
        self.assertEqual(len(new), 1)
        self.assertEqual(new.version, 2)
        self.assertEqual(new.state, "draft")
        self.assertEqual(len(new.line_ids), 1)
        self.assertEqual(new.line_ids.section_id.boq_id, new)
        self.assertEqual(new.amount_sell_total, 50000)
        self.assertEqual(self.boq.state, "locked")

    def test_percent_complete(self):
        self.line.qty_certified = 40
        self.assertEqual(self.line.percent_complete, 40)
