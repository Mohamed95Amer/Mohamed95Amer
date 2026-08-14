"""Commitment is the sum of what was ordered and what was let.

A procurement screen that showed only purchase orders would understate the
commitment on every construction job, because the packages of work are let as
subcontracts. So the view unions the two, and these tests hold it to that:
both kinds appear, they are distinguishable, and the money adds up.

The id arithmetic is worth pinning too. Two source tables in one view means
purchase line 1 and subcontract line 1 would collide on id, and the ORM would
silently show one where the other belongs — a wrong row that looks entirely
plausible.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestProcurementReport(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.vendor = cls.env["res.partner"].create({"name": "Supplier"})
        cls.subbie = cls.env["res.partner"].create({"name": "Packager"})
        cls.project = cls.env["project.project"].create({
            "name": "Buying", "is_construction": True, "project_code": "BUY"})
        cls.product = cls.env["product.product"].create({
            "name": "Rebar", "type": "consu"})

    def _rows(self, **domain):
        self.env.flush_all()
        terms = [("project_id", "=", self.project.id)]
        terms += [(k, "=", v) for k, v in domain.items()]
        return self.env["majal.procurement.report"].search(terms)

    def _purchase(self, qty=10.0, price=1000.0):
        order = self.env["purchase.order"].create({
            "partner_id": self.vendor.id,
            "construction_project_id": self.project.id,
            "order_line": [(0, 0, {
                "product_id": self.product.id,
                "product_qty": qty,
                "price_unit": price,
                "name": "Rebar 16mm",
            })],
        })
        order.button_confirm()
        return order

    def _subcontract(self, rate=50_000.0):
        subcontract = self.env["construction.subcontract"].create({
            "project_id": self.project.id,
            "subcontractor_id": self.subbie.id,
            "name": "Blockwork",
            "line_ids": [(0, 0, {
                "name": "Blockwork", "quantity": 1.0, "unit_rate": rate,
            })],
        })
        subcontract.state = "confirmed"
        return subcontract

    def test_a_purchase_order_appears_as_a_commitment(self):
        self._purchase(qty=10.0, price=1000.0)
        rows = self._rows(source="purchase")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows.amount_committed, 10_000.0, places=2)
        self.assertEqual(rows.partner_id, self.vendor)

    def test_a_subcontract_appears_as_a_commitment_too(self):
        """The half a purchase-only screen would miss."""
        self._subcontract(rate=50_000.0)
        rows = self._rows(source="subcontract")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows.amount_committed, 50_000.0, places=2)
        self.assertEqual(rows.partner_id, self.subbie)

    def test_the_two_add_up_and_stay_distinguishable(self):
        self._purchase(qty=10.0, price=1000.0)
        self._subcontract(rate=50_000.0)
        rows = self._rows()

        self.assertEqual(len(rows), 2)
        self.assertAlmostEqual(
            sum(rows.mapped("amount_committed")), 60_000.0, places=2)
        self.assertEqual(set(rows.mapped("source")),
                         {"purchase", "subcontract"})

    def test_ids_from_the_two_tables_do_not_collide(self):
        """Both source tables start at id 1. Without a namespace the view
        would return one row where two belong, and the row it kept would look
        perfectly reasonable."""
        self._purchase()
        self._subcontract()
        rows = self._rows()
        self.assertEqual(len(set(rows.ids)), len(rows.ids))

    def test_nothing_received_is_all_outstanding(self):
        """Ordered and not delivered is the exposure sitting with suppliers,
        which is the number a buyer chases."""
        self._purchase(qty=10.0, price=1000.0)
        row = self._rows(source="purchase")
        self.assertAlmostEqual(row.qty_received, 0.0, places=2)
        self.assertAlmostEqual(row.amount_outstanding, 10_000.0, places=2)

    def test_a_subcontract_reports_no_delivery_rather_than_pretending(self):
        """A package's progress is certified, not delivered. Reporting a
        received quantity for it would invent a fact."""
        self._subcontract()
        row = self._rows(source="subcontract")
        self.assertAlmostEqual(row.qty_received, 0.0, places=2)
        self.assertAlmostEqual(row.amount_outstanding, 0.0, places=2)

    def test_a_cancelled_order_leaves_the_commitment(self):
        order = self._purchase()
        self.assertEqual(len(self._rows(source="purchase")), 1)
        order.button_cancel()
        self.assertEqual(len(self._rows(source="purchase")), 0)

    def test_a_draft_subcontract_is_not_a_commitment_yet(self):
        subcontract = self._subcontract()
        subcontract.state = "draft"
        self.assertEqual(len(self._rows(source="subcontract")), 0)

    def test_an_order_for_no_project_stays_out_of_the_job_figures(self):
        """purchase.order without construction_project_id is general
        overhead, not a job commitment, and adding it to a project total
        would overstate every job it touched."""
        self.env["purchase.order"].create({
            "partner_id": self.vendor.id,
            "order_line": [(0, 0, {
                "product_id": self.product.id,
                "product_qty": 5.0, "price_unit": 100.0, "name": "Office",
            })],
        }).button_confirm()
        self.assertEqual(len(self._rows(source="purchase")), 0)
