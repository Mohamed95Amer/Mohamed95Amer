from odoo import fields
from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionMaterial(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Material Test Project", "is_construction": True}
        )
        cls.concrete = cls.env["product.product"].create({
            "name": "Concrete C30",
            "type": "consu",
            "is_storable": True,
            "standard_price": 60.0,
        })
        # BOQ prices 100 m3 of concrete: the budget every actual is read against.
        cls.boq = cls.env["construction.boq"].create({"project_id": cls.project.id})
        cls.boq_line = cls.env["construction.boq.line"].create({
            "boq_id": cls.boq.id,
            "name": "Raft concrete",
            "product_id": cls.concrete.id,
            "quantity": 100,
            "unit_rate": 90,
            "cost_material": 60,
        })
        cls.boq.action_approve()

    def _stock_up(self, qty, product=None):
        """Put stock into the project's site store."""
        product = product or self.concrete
        self.project.ensure_site_location()
        self.env["stock.quant"].with_context(inventory_mode=True).create({
            "product_id": product.id,
            "location_id": self.project.site_location_id.id,
            "inventory_quantity": qty,
        })._apply_inventory()

    def _issue(self, qty, product=None, confirm=True):
        product = product or self.concrete
        issue = self.env["construction.material.issue"].create({
            "name": "Pour to raft",
            "project_id": self.project.id,
            "line_ids": [(0, 0, {
                "product_id": product.id,
                "boq_line_id": self.boq_line.id,
                "quantity": qty,
            })],
        })
        if confirm:
            issue.action_confirm()
        return issue

    def _summary(self, product=None):
        product = product or self.concrete
        return self.env["construction.material.summary"].search([
            ("project_id", "=", self.project.id),
            ("product_id", "=", product.id),
        ])

    # ------------------------------------------------------------------
    # Site store
    # ------------------------------------------------------------------
    def test_site_location_is_created_on_demand(self):
        """A tender-stage job should not clutter the warehouse tree."""
        fresh = self.env["project.project"].create(
            {"name": "Not started", "is_construction": True}
        )
        self.assertFalse(fresh.site_location_id)
        fresh.ensure_site_location()
        self.assertTrue(fresh.site_location_id)
        self.assertEqual(fresh.site_location_id.usage, "internal")
        # Idempotent — a second call must not create a second store.
        location = fresh.site_location_id
        fresh.ensure_site_location()
        self.assertEqual(fresh.site_location_id, location)

    # ------------------------------------------------------------------
    # Issuing
    # ------------------------------------------------------------------
    def test_issue_moves_stock_out_of_the_store(self):
        self._stock_up(120)
        issue = self._issue(40)
        self.assertEqual(issue.state, "done")
        self.assertEqual(len(issue.move_ids), 1)
        self.assertEqual(issue.move_ids.state, "done")
        remaining = self.concrete.with_context(
            location=self.project.site_location_id.id
        ).qty_available
        self.assertEqual(remaining, 80)

    def test_issue_value_uses_product_cost(self):
        self._stock_up(50)
        issue = self._issue(10)
        self.assertEqual(issue.total_value, 600)   # 10 x 60

    def test_empty_issue_cannot_be_confirmed(self):
        issue = self.env["construction.material.issue"].create({
            "name": "Nothing", "project_id": self.project.id,
        })
        with self.assertRaises(UserError):
            issue.action_confirm()

    def test_zero_quantity_is_rejected(self):
        issue = self._issue(0, confirm=False)
        with self.assertRaises(UserError):
            issue.action_confirm()

    def test_confirmed_issue_cannot_be_cancelled(self):
        """Stock has already moved; cancelling the paperwork would leave the
        register and the inventory disagreeing."""
        self._stock_up(20)
        issue = self._issue(5)
        with self.assertRaises(UserError):
            issue.action_cancel()

    # ------------------------------------------------------------------
    # Material position
    # ------------------------------------------------------------------
    def test_summary_reports_budget_consumed_and_on_hand(self):
        self._stock_up(120)
        self._issue(40)
        row = self._summary()
        self.assertEqual(len(row), 1)
        self.assertEqual(row.qty_budget, 100)
        self.assertEqual(row.qty_consumed, 40)
        self.assertEqual(row.qty_on_hand, 80)
        self.assertEqual(row.qty_wasted, 0)
        # 40 consumed against 100 budgeted is 60 under.
        self.assertEqual(row.qty_variance, -60)
        self.assertEqual(row.consumed_value, 2400)

    def test_waste_counts_against_the_budget_and_shows_a_waste_rate(self):
        """Waste is consumption the works never received — it has to land in
        both the variance and its own rate, or over-ordering looks free."""
        self._stock_up(200)
        self._issue(90)
        scrap = self.env["stock.scrap"].create({
            "product_id": self.concrete.id,
            "scrap_qty": 30,
            "project_id": self.project.id,
            "waste_reason": "spillage",
            "location_id": self.project.site_location_id.id,
        })
        scrap.action_validate()

        row = self._summary()
        self.assertEqual(row.qty_consumed, 90)
        self.assertEqual(row.qty_wasted, 30)
        # 90 + 30 = 120 against 100 budgeted -> 20 over, +20%.
        self.assertEqual(row.qty_variance, 20)
        self.assertAlmostEqual(row.variance_percent, 20.0, places=4)
        # 30 wasted of 120 issued = 25%.
        self.assertAlmostEqual(row.waste_percent, 25.0, places=4)
        self.assertEqual(row.waste_value, 1800)

    def test_over_consumption_is_visible_as_a_positive_variance(self):
        self._stock_up(200)
        self._issue(130)
        row = self._summary()
        self.assertEqual(row.qty_variance, 30)
        self.assertAlmostEqual(row.variance_percent, 30.0, places=4)

    def test_the_position_refreshes_after_an_issue(self):
        """A figure read before a movement must not be served again after it.

        The summary is a SQL view over other models, so Odoo neither flushes
        them nor drops its own cached rows on its own — and the view's ids come
        from row_number(), which happily hands the same id to a different row.
        """
        self._stock_up(120)
        self.assertEqual(self._summary().qty_on_hand, 120)
        self._issue(30)
        self.assertEqual(self._summary().qty_on_hand, 90)
        self.assertEqual(self._summary().qty_consumed, 30)

    def test_draft_boq_is_not_a_budget(self):
        """An unapproved bill is not a commitment to a quantity."""
        other = self.env["project.project"].create(
            {"name": "Draft BOQ job", "is_construction": True}
        )
        boq = self.env["construction.boq"].create({"project_id": other.id})
        self.env["construction.boq.line"].create({
            "boq_id": boq.id, "name": "x", "product_id": self.concrete.id,
            "quantity": 50, "unit_rate": 90,
        })
        rows = self.env["construction.material.summary"].search(
            [("project_id", "=", other.id)]
        )
        self.assertFalse(rows)

    def test_project_rollup_matches_the_summary_rows(self):
        self._stock_up(200)
        self._issue(90)
        scrap = self.env["stock.scrap"].create({
            "product_id": self.concrete.id,
            "scrap_qty": 10,
            "project_id": self.project.id,
            "waste_reason": "offcut",
            "location_id": self.project.site_location_id.id,
        })
        scrap.action_validate()

        self.project.invalidate_recordset()
        self.assertEqual(self.project.material_consumed_value, 90 * 60)
        self.assertEqual(self.project.material_waste_value, 10 * 60)
        self.assertEqual(self.project.material_budget_value, 100 * 60)
        # 10 wasted of 100 issued.
        self.assertAlmostEqual(self.project.material_waste_percent, 10.0, places=4)
        self.assertEqual(self.project.material_over_budget_count, 0)

    # ------------------------------------------------------------------
    # Deliveries
    # ------------------------------------------------------------------
    def test_purchase_receipt_lands_in_the_site_store(self):
        """A delivery has to reach the project's store, otherwise the material
        position counts stock the site never held."""
        vendor = self.env["res.partner"].create({"name": "Readymix Co"})
        order = self.env["purchase.order"].create({
            "partner_id": vendor.id,
            "construction_project_id": self.project.id,
            "order_line": [(0, 0, {
                "product_id": self.concrete.id,
                "product_qty": 40,
                "price_unit": 60,
                "name": "Concrete",
                "date_planned": fields.Datetime.now(),
            })],
        })
        order.button_confirm()

        picking = order.picking_ids
        self.assertTrue(picking, "confirming the order should raise a receipt")
        self.assertEqual(picking.construction_project_id, self.project)
        site = self.project.site_location_id
        self.assertTrue(
            all(m.location_dest_id == site for m in picking.move_ids),
            "every received move must be destined for the project's site store",
        )

        for move in picking.move_ids:
            move.quantity = move.product_uom_qty
            move.picked = True
        picking.button_validate()

        on_hand = self.concrete.with_context(location=site.id).qty_available
        self.assertEqual(on_hand, 40)

    def test_order_without_a_project_is_untouched(self):
        vendor = self.env["res.partner"].create({"name": "General supplier"})
        order = self.env["purchase.order"].create({
            "partner_id": vendor.id,
            "order_line": [(0, 0, {
                "product_id": self.concrete.id,
                "product_qty": 5,
                "price_unit": 60,
                "name": "Concrete",
                "date_planned": fields.Datetime.now(),
            })],
        })
        order.button_confirm()
        self.assertFalse(order.picking_ids.construction_project_id)
