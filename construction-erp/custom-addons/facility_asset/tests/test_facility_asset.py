from datetime import date, timedelta

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityAsset(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.site = cls.env["facility.location"].create(
            {"name": "Tower", "location_type": "site"})
        cls.floor = cls.env["facility.location"].create(
            {"name": "L3", "location_type": "floor", "parent_id": cls.site.id})
        cls.room = cls.env["facility.location"].create(
            {"name": "Plant Room", "location_type": "room",
             "parent_id": cls.floor.id})
        cls.asset = cls.env["maintenance.equipment"].create({
            "name": "AHU-01", "facility_location_id": cls.room.id,
            "criticality": "high"})

    def test_location_hierarchy(self):
        self.assertEqual(self.room.complete_name, "Tower / L3 / Plant Room")

    def test_asset_count_rolls_up(self):
        # asset in room counts for room, floor and site
        self.assertEqual(self.site.asset_count, 1)
        self.assertEqual(self.floor.asset_count, 1)
        self.assertEqual(self.room.asset_count, 1)

    def test_warranty_active(self):
        self.asset.warranty_date = date.today() + timedelta(days=10)
        self.assertTrue(self.asset.warranty_active)
        self.asset.warranty_date = date.today() - timedelta(days=1)
        self.assertFalse(self.asset.warranty_active)

    def test_warranty_search(self):
        self.asset.warranty_date = date.today() + timedelta(days=5)
        found = self.env["maintenance.equipment"].search(
            [("warranty_active", "=", True)])
        self.assertIn(self.asset, found)

    def test_meter_current_value(self):
        meter = self.env["facility.asset.meter"].create(
            {"name": "Hours", "equipment_id": self.asset.id, "uom": "hours"})
        self.env["facility.asset.meter.reading"].create([
            {"meter_id": meter.id, "date": date(2026, 1, 1), "value": 100},
            {"meter_id": meter.id, "date": date(2026, 2, 1), "value": 250},
        ])
        self.assertEqual(meter.current_value, 250)
        self.assertEqual(meter.last_reading_date, date(2026, 2, 1))

    def test_failure_codes_on_request(self):
        problem = self.env["facility.failure.code"].create(
            {"name": "No cooling", "failure_type": "problem"})
        req = self.env["maintenance.request"].create({
            "name": "AHU down", "equipment_id": self.asset.id,
            "failure_problem_id": problem.id, "downtime_hours": 4})
        self.assertEqual(req.failure_problem_id, problem)
        self.assertEqual(req.downtime_hours, 4)
        # location flows from the equipment
        self.assertEqual(req.facility_location_id, self.room)

    def test_warranty_cron_creates_activity(self):
        self.asset.warranty_date = date.today() + timedelta(days=10)
        self.asset.technician_user_id = self.env.user
        self.env["maintenance.equipment"]._cron_warranty_alerts()
        self.assertTrue(self.asset.activity_ids)

    def test_asset_hierarchy(self):
        child = self.env["maintenance.equipment"].create(
            {"name": "AHU-01 Fan", "parent_id": self.asset.id})
        self.assertIn(child, self.asset.child_ids)
        self.assertEqual(self.asset.asset_count_children, 1)
