from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityInventory(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tower = cls.env["facility.location"].create(
            {"name": "Test Tower", "location_type": "building"})
        cls.plantroom = cls.env["facility.location"].create(
            {"name": "L3 Plantroom", "location_type": "room",
             "parent_id": cls.tower.id})
        cls.chiller = cls.env["maintenance.equipment"].create({
            "name": "Chiller CH-99",
            "facility_location_id": cls.plantroom.id,
        })
        cls.belt = cls.env["product.product"].create({
            "name": "Drive belt", "type": "consu",
            "is_storable": True, "standard_price": 50.0,
        })
        cls.filter = cls.env["product.product"].create({
            "name": "Panel filter", "type": "consu",
            "is_storable": True, "standard_price": 20.0,
        })
        cls.technician = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Parts Technician",
            "login": "parts-technician-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
        })
        cls.facility_manager = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Parts Manager",
            "login": "parts-manager-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(
                6,
                0,
                [cls.env.ref("maintenance.group_equipment_manager").id],
            )],
        })

    def _stock_up(self, location, product, qty):
        store = location.ensure_store()
        self.env["stock.quant"].with_context(inventory_mode=True).create({
            "product_id": product.id,
            "location_id": store.id,
            "inventory_quantity": qty,
        })._apply_inventory()
        return store

    def _work_order(self, **vals):
        values = {"name": "Chiller not cooling", "equipment_id": self.chiller.id}
        values.update(vals)
        return self.env["maintenance.request"].create(values)

    def _part(self, request, product=None, qty=1.0, **vals):
        values = {
            "request_id": request.id,
            "product_id": (product or self.belt).id,
            "quantity": qty,
        }
        values.update(vals)
        return self.env["facility.request.part"].create(values)

    def _summary(self, store, product):
        return self.env["facility.parts.summary"].search([
            ("location_id", "=", store.id), ("product_id", "=", product.id)])

    # ------------------------------------------------------------------
    # Stores
    # ------------------------------------------------------------------
    def test_a_store_is_created_on_demand(self):
        """Most rooms in a building never hold a spare."""
        fresh = self.env["facility.location"].create({"name": "Empty room"})
        self.assertFalse(fresh.stock_location_id)
        fresh.ensure_store()
        self.assertTrue(fresh.stock_location_id)
        self.assertEqual(fresh.stock_location_id.usage, "internal")

        existing = fresh.stock_location_id
        fresh.ensure_store()
        self.assertEqual(fresh.stock_location_id, existing,
                         "a second call must not create a second store")

    def test_an_asset_draws_from_the_nearest_store_above_it(self):
        """Spares live in the building store, not in the room with the asset."""
        tower_store = self.tower.ensure_store()
        self.assertFalse(self.plantroom.stock_location_id)
        self.assertEqual(self.chiller._parts_store(), tower_store)

        # A store on the room itself is closer, so it wins.
        room_store = self.plantroom.ensure_store()
        self.assertEqual(self.chiller._parts_store(), room_store)

    def test_store_parent_is_company_compatible(self):
        """A hosted tenant can create its store outside the install company."""
        company = self.env["res.company"].create({"name": "FM Tenant Company"})
        location = self.env["facility.location"].sudo().create({
            "name": "Tenant Operations Tower",
            "location_type": "building",
            "company_id": company.id,
        })

        store = location.sudo().ensure_store()

        self.assertEqual(store.company_id, company)
        self.assertEqual(store.location_id.company_id, company)
        self.assertEqual(store.location_id.usage, "view")

    # ------------------------------------------------------------------
    # Consuming parts
    # ------------------------------------------------------------------
    def test_consuming_a_part_moves_real_stock(self):
        store = self._stock_up(self.plantroom, self.belt, 5)
        request = self._work_order()
        line = self._part(request, qty=2)

        request.action_consume_parts()

        self.assertEqual(line.state, "consumed")
        self.assertTrue(line.move_id)
        self.assertEqual(line.move_id.state, "done")
        remaining = self.belt.with_context(location=store.id).qty_available
        self.assertEqual(remaining, 3)

    def test_parts_cost_stops_being_typed(self):
        """The whole point: cost follows what left the store."""
        self._stock_up(self.plantroom, self.belt, 10)
        request = self._work_order()
        request.parts_cost = 999.0  # somebody's guess
        self._part(request, qty=3)

        request.action_consume_parts()

        self.assertEqual(request.parts_issued_value, 150.0)  # 3 x 50
        self.assertTrue(request.parts_from_stock)
        self.assertEqual(request.parts_cost, 150.0,
                         "the measured value must replace the typed one")
        self.assertEqual(request.total_cost, 150.0)

    def test_a_work_order_with_no_stock_parts_keeps_its_typed_cost(self):
        """Contractor-supplied material never passes through our store."""
        request = self._work_order()
        request.parts_cost = 340.0
        self.assertFalse(request.parts_from_stock)
        self.assertEqual(request.parts_cost, 340.0)
        self.assertEqual(request.total_cost, 340.0)

    def test_consuming_twice_does_not_double_count(self):
        self._stock_up(self.plantroom, self.belt, 10)
        request = self._work_order()
        self._part(request, qty=2)
        request.action_consume_parts()
        self.assertEqual(request.parts_issued_value, 100.0)

        with self.assertRaises(UserError):
            request.action_consume_parts()
        self.assertEqual(request.parts_issued_value, 100.0)

    def test_a_consumed_line_cannot_be_deleted(self):
        """Deleting it would leave the job card and the inventory disagreeing."""
        self._stock_up(self.plantroom, self.belt, 5)
        request = self._work_order()
        line = self._part(request, qty=1)
        request.action_consume_parts()
        with self.assertRaises(UserError):
            line.unlink()

    def test_a_planned_line_can_still_be_deleted(self):
        request = self._work_order()
        line = self._part(request, qty=1)
        line.unlink()
        self.assertFalse(line.exists())

    def test_technician_cannot_delete_planned_part_evidence(self):
        request = self._work_order(user_id=self.technician.id)
        line = self._part(request, qty=1)
        line.with_user(self.technician).write({"quantity": 2})
        with self.assertRaises(AccessError):
            line.with_user(self.technician).unlink()
        line.with_user(self.facility_manager).unlink()
        self.assertFalse(line.exists())

    def test_zero_quantity_is_refused(self):
        self._stock_up(self.plantroom, self.belt, 5)
        request = self._work_order()
        self._part(request, qty=0)
        with self.assertRaises(UserError):
            request.action_consume_parts()

    def test_an_asset_with_nowhere_to_draw_from_says_so(self):
        loose = self.env["maintenance.equipment"].create({"name": "Unplaced asset"})
        request = self._work_order(equipment_id=loose.id)
        self._part(request, qty=1)
        with self.assertRaises(UserError):
            request.action_consume_parts()

    def test_the_line_shows_what_is_in_the_store(self):
        self._stock_up(self.plantroom, self.belt, 7)
        request = self._work_order()
        line = self._part(request, qty=1)
        line.invalidate_recordset()
        self.assertEqual(line.qty_available, 7)

    # ------------------------------------------------------------------
    # Parts position
    # ------------------------------------------------------------------
    def test_the_position_reports_on_hand_and_consumed(self):
        store = self._stock_up(self.plantroom, self.belt, 10)
        request = self._work_order()
        self._part(request, qty=4)
        request.action_consume_parts()

        row = self._summary(store, self.belt)
        self.assertEqual(len(row), 1)
        self.assertEqual(row.qty_on_hand, 6)
        self.assertEqual(row.qty_consumed, 4)
        self.assertEqual(row.on_hand_value, 300.0)
        self.assertEqual(row.consumed_value, 200.0)

    def test_the_minimum_on_the_spare_list_finally_means_something(self):
        """It has always been recorded. Nothing ever counted against it."""
        store = self._stock_up(self.plantroom, self.belt, 5)
        self.env["facility.spare.line"].create({
            "equipment_id": self.chiller.id,
            "product_id": self.belt.id,
            "min_qty": 8,
        })
        row = self._summary(store, self.belt)
        self.assertTrue(row.below_reorder)
        self.assertEqual(row.min_qty, 8)
        self.assertEqual(row.qty_to_order, 3)

    def test_stock_above_the_minimum_is_not_flagged(self):
        store = self._stock_up(self.plantroom, self.belt, 12)
        self.env["facility.spare.line"].create({
            "equipment_id": self.chiller.id,
            "product_id": self.belt.id,
            "min_qty": 8,
        })
        row = self._summary(store, self.belt)
        self.assertFalse(row.below_reorder)
        self.assertEqual(row.qty_to_order, 0)

    def test_a_part_with_no_minimum_is_never_flagged(self):
        store = self._stock_up(self.plantroom, self.filter, 1)
        row = self._summary(store, self.filter)
        self.assertFalse(row.below_reorder)

    def test_the_position_refreshes_after_a_consumption(self):
        """The view reads other models, which Odoo does not auto-flush."""
        store = self._stock_up(self.plantroom, self.belt, 10)
        self.assertEqual(self._summary(store, self.belt).qty_on_hand, 10)

        request = self._work_order()
        self._part(request, qty=3)
        request.action_consume_parts()

        self.assertEqual(self._summary(store, self.belt).qty_on_hand, 7)

    # ------------------------------------------------------------------
    # Contract link
    # ------------------------------------------------------------------
    def test_parts_are_recoverable_when_the_contract_excludes_them(self):
        self._stock_up(self.plantroom, self.belt, 10)
        client = self.env["res.partner"].create({"name": "Tower Owners"})
        contract = self.env["contract.contract"].create({
            "name": "Chiller AMC",
            "partner_id": client.id,
            "contract_type": "sale",
            "line_recurrence": False,
            "is_amc": True,
            "covers_parts": False,
            "equipment_ids": [(6, 0, [self.chiller.id])],
        })
        request = self._work_order()
        self._part(request, qty=2)
        request.action_consume_parts()

        contract.invalidate_recordset()
        self.assertEqual(request.facility_contract_id, contract)
        self.assertTrue(request.contract_covered)
        self.assertEqual(contract.recoverable_parts_value, 100.0)

        # Once parts are inside the fee, nothing is recoverable.
        contract.covers_parts = True
        contract.invalidate_recordset()
        self.assertEqual(contract.recoverable_parts_value, 0.0)
