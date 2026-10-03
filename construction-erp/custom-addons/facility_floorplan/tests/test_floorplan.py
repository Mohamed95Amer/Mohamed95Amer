from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFloorplan(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.location = cls.env["facility.location"].create(
            {"name": "Tower A", "location_type": "building"}
        )
        cls.floor = cls.env["facility.location"].create(
            {"name": "Level 3", "location_type": "floor",
             "parent_id": cls.location.id}
        )
        cls.plan = cls.env["facility.floorplan"].create(
            {"name": "L3 Plan", "location_id": cls.floor.id}
        )

    def test_coordinate_constraint(self):
        with self.assertRaises(ValidationError):
            self.env["facility.pin"].create(
                {
                    "name": "bad",
                    "floorplan_id": self.plan.id,
                    "pos_x": 1.4,
                    "pos_y": 0.2,
                    "pin_type": "note",
                }
            )

    def test_create_asset_pin_creates_equipment(self):
        pin_data = self.env["facility.pin"].create_pin_with_target(
            self.plan.id, 0.5, 0.5, "asset", "Chiller-2"
        )
        pin = self.env["facility.pin"].browse(pin_data["id"])
        self.assertEqual(pin.pin_type, "asset")
        self.assertTrue(pin.equipment_id)
        self.assertEqual(pin.equipment_id.name, "Chiller-2")
        self.assertEqual(pin.equipment_id.facility_location_id, self.floor)
        self.assertEqual(pin.location_id, self.floor)

    def test_create_request_pin_creates_request(self):
        pin_data = self.env["facility.pin"].create_pin_with_target(
            self.plan.id, 0.3, 0.4, "request", "Leak", "Water near stair"
        )
        pin = self.env["facility.pin"].browse(pin_data["id"])
        self.assertTrue(pin.request_id)
        self.assertEqual(pin.request_id.name, "Leak")
        self.assertTrue(pin.status)

    def test_get_plan_data(self):
        self.env["facility.pin"].create(
            {
                "name": "note",
                "floorplan_id": self.plan.id,
                "pos_x": 0.1,
                "pos_y": 0.1,
                "pin_type": "note",
            }
        )
        data = self.env["facility.pin"].get_plan_data(self.plan.id)
        self.assertEqual(data["sheet"]["id"], self.plan.id)
        self.assertEqual(data["sheet"]["sheet_model"], "facility.floorplan")
        self.assertEqual(len(data["pins"]), 1)
        self.assertTrue(
            any(s["id"] == self.plan.id for s in data["sheets"])
        )
        type_ids = [t["id"] for t in data["pin_types"]]
        self.assertEqual(type_ids, ["asset", "request", "note"])

    def test_open_target_action(self):
        pin_data = self.env["facility.pin"].create_pin_with_target(
            self.plan.id, 0.5, 0.5, "asset", "Pump"
        )
        pin = self.env["facility.pin"].browse(pin_data["id"])
        action = pin.action_open_target()
        self.assertEqual(action["res_model"], "maintenance.equipment")
        self.assertEqual(action["res_id"], pin.equipment_id.id)

    def test_upload_sheet_rpc(self):
        # Minimal valid PDF header.
        import base64
        data_b64 = base64.b64encode(b"%PDF-1.4 test").decode()
        res = self.plan.upload_sheet("plan.pdf", data_b64)
        self.assertTrue(res["attachment_id"])
        self.assertTrue(self.plan.has_sheet)

    def test_floorplan_count_on_location(self):
        self.assertEqual(self.floor.floorplan_count, 1)
