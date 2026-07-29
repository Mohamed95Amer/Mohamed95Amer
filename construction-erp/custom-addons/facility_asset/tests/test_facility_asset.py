from datetime import date, timedelta

from odoo.tests import TransactionCase, tagged
from odoo.exceptions import AccessError


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
        cls.technician = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Facility Technician",
            "login": "facility-technician-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
        })
        cls.facility_manager = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Facility Manager",
            "login": "facility-manager-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(
                6,
                0,
                [cls.env.ref("maintenance.group_equipment_manager").id],
            )],
        })

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

    def test_secure_asset_tag_identity(self):
        second = self.env["maintenance.equipment"].create({"name": "Pump-02"})
        self.assertTrue(self.asset.barcode.startswith("AST-"))
        self.assertTrue(self.asset.tag_token)
        self.assertNotEqual(self.asset.barcode, second.barcode)
        self.assertNotEqual(self.asset.tag_token, second.tag_token)
        db_name = self.env.cr.dbname
        self.assertIn(f"/web/login?db={db_name}&redirect=", self.asset.qr_tag_url)
        self.assertIn(
            f"%2Fmajal%2Fasset%2F{self.asset.tag_token}%2Fqr",
            self.asset.qr_tag_url)
        self.assertIn(
            f"%2Fmajal%2Fasset%2F{self.asset.tag_token}%2Fnfc",
            self.asset.nfc_tag_url)
        self.assertIn("%3A", self.asset.qr_tag_encoded_url)

    def test_tag_scan_is_audited(self):
        scan = self.asset.record_tag_scan("nfc")
        self.assertEqual(scan.equipment_id, self.asset)
        self.assertEqual(scan.source, "nfc")
        self.assertEqual(scan.user_id, self.env.user)
        self.assertEqual(scan.facility_location_id, self.room)
        self.assertEqual(self.asset.last_scan_at, scan.scanned_at)
        self.assertEqual(self.asset.scan_count, 1)

    def test_inactive_tag_cannot_record_scan(self):
        self.asset.tag_status = "retired"
        with self.assertRaises(AccessError):
            self.asset.record_tag_scan("qr")

    def test_technician_cannot_delete_work_order_evidence(self):
        request = self.env["maintenance.request"].create({
            "name": "Assigned AHU repair",
            "equipment_id": self.asset.id,
            "user_id": self.technician.id,
        })
        request.with_user(self.technician).write({"description": "Inspected"})
        with self.assertRaises(AccessError):
            request.with_user(self.technician).unlink()
        self.assertTrue(request.exists())
        request.with_user(self.facility_manager).unlink()
        self.assertFalse(request.exists())

    def test_technician_records_readings_but_cannot_configure_or_delete(self):
        meter = self.env["facility.asset.meter"].create({
            "name": "Runtime",
            "equipment_id": self.asset.id,
            "uom": "hours",
        })
        with self.assertRaises(AccessError):
            self.env["facility.asset.meter"].with_user(self.technician).create({
                "name": "Unapproved meter",
                "equipment_id": self.asset.id,
                "uom": "hours",
            })
        reading = self.env["facility.asset.meter.reading"].with_user(
            self.technician
        ).create({
            "meter_id": meter.id,
            "date": date.today(),
            "value": 310,
        })
        with self.assertRaises(AccessError):
            reading.with_user(self.technician).unlink()
        reading.with_user(self.facility_manager).unlink()
        self.assertFalse(reading.exists())
