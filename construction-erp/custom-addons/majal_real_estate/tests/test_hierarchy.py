"""Development -> Community -> Building -> Floor -> Unit.

The hierarchy is the whole point of this module: a building must resolve
to exactly one development, a unit must resolve to exactly one building and
floor, and every level's counts must reflect what is actually underneath it
so a development or building record is a trustworthy summary, not just a
folder.
"""

from psycopg2 import IntegrityError

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class TestHierarchy(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Marina Heights (test)", "code": "MHTEST"})
        cls.community = cls.env["majal.community"].create(
            {"name": "Marina Heights Community", "development_id": cls.development.id})
        cls.building = cls.env["majal.building"].create({
            "name": "Tower A", "code": "A",
            "development_id": cls.development.id,
            "community_id": cls.community.id,
        })
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 12", "number": 12, "building_id": cls.building.id})

    def test_a_unit_resolves_its_full_hierarchy_through_the_floor(self):
        unit = self.env["majal.unit"].create(
            {"name": "A-1201", "floor_id": self.floor.id})
        self.assertEqual(unit.building_id, self.building)
        self.assertEqual(unit.development_id, self.development)
        self.assertEqual(unit.community_id, self.community)

    def test_counts_roll_up_at_every_level(self):
        self.env["majal.unit"].create([
            {"name": "A-1201", "floor_id": self.floor.id},
            {"name": "A-1202", "floor_id": self.floor.id},
        ])
        self.floor.invalidate_recordset()
        self.building.invalidate_recordset()
        self.community.invalidate_recordset()
        self.development.invalidate_recordset()

        self.assertEqual(self.floor.unit_count, 2)
        self.assertEqual(self.building.unit_count, 2)
        self.assertEqual(self.building.floor_count, 1)
        self.assertEqual(self.community.building_count, 1)
        self.assertEqual(self.development.unit_count, 2)
        self.assertEqual(self.development.building_count, 1)
        self.assertEqual(self.development.community_count, 1)

    def test_a_building_may_skip_the_community_layer(self):
        direct_building = self.env["majal.building"].create(
            {"name": "Clubhouse", "code": "CH",
             "development_id": self.development.id})
        self.assertFalse(direct_building.community_id)
        self.development.invalidate_recordset()
        self.assertEqual(self.development.building_count, 2)

    def test_a_building_cannot_borrow_a_community_from_another_development(self):
        other_development = self.env["majal.development"].create(
            {"name": "Business Bay Tower", "code": "BBT"})
        with self.assertRaises(ValidationError):
            self.env["majal.building"].create({
                "name": "Rogue Tower", "code": "R",
                "development_id": other_development.id,
                "community_id": self.community.id,
            })

    @mute_logger("odoo.sql_db")
    def test_two_floors_cannot_share_a_number_in_one_building(self):
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self.env["majal.floor"].create(
                    {"name": "Floor 12 (duplicate)", "number": 12,
                     "building_id": self.building.id})

    @mute_logger("odoo.sql_db")
    def test_two_units_cannot_share_a_code_in_one_building(self):
        self.env["majal.unit"].create({"name": "A-1201", "floor_id": self.floor.id})
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                self.env["majal.unit"].create(
                    {"name": "A-1201", "floor_id": self.floor.id})

    def test_unit_total_area_and_price_per_sqft_are_computed(self):
        unit = self.env["majal.unit"].create({
            "name": "A-1201", "floor_id": self.floor.id,
            "suite_area": 720.0, "balcony_area": 90.0, "list_price": 1180000,
        })
        self.assertEqual(unit.total_area, 810.0)
        # price_per_sqft is Monetary, so the ORM rounds it to currency
        # precision (2 places) on read -- compare at that precision, not
        # against the unrounded Python division.
        self.assertAlmostEqual(unit.price_per_sqft, 1180000 / 810.0, places=2)

    def test_price_per_sqft_is_zero_without_area_not_a_division_error(self):
        unit = self.env["majal.unit"].create(
            {"name": "A-1201", "floor_id": self.floor.id, "list_price": 1180000})
        self.assertEqual(unit.price_per_sqft, 0.0)
