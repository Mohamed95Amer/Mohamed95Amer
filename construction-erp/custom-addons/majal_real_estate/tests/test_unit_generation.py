"""The unit type -> generation wizard -> units pipeline (doc section 7):
define a template once, stamp it across whichever floors it applies to,
then let exceptions be made on the generated unit afterward.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestUnitGeneration(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Marina Heights (test)", "code": "MHTEST"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower A", "code": "A", "development_id": cls.development.id})
        cls.floor_16 = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.floor_17 = cls.env["majal.floor"].create(
            {"name": "Floor 17", "number": 17, "building_id": cls.building.id})
        cls.unit_type = cls.env["majal.unit.type"].create({
            "name": "1BR Type A", "development_id": cls.development.id,
            "unit_category": "1br", "bedrooms": 1, "bathrooms": 2,
            "suite_area": 720, "balcony_area": 90, "typical_price": 1180000,
        })

    def _wizard(self, floors, **vals):
        return self.env["majal.unit.generate.wizard"].create({
            "development_id": self.development.id,
            "unit_type_id": self.unit_type.id,
            "building_id": self.building.id,
            "floor_ids": [(6, 0, floors.ids)],
            "code_prefix": "A",
            "code_suffix": "01",
            **vals,
        })

    def test_generate_creates_one_unit_per_selected_floor_named_by_pattern(self):
        wizard = self._wizard(self.floor_16 + self.floor_17)
        wizard.action_generate()
        unit_16 = self.env["majal.unit"].search(
            [("floor_id", "=", self.floor_16.id)])
        unit_17 = self.env["majal.unit"].search(
            [("floor_id", "=", self.floor_17.id)])
        self.assertEqual(unit_16.name, "A1601")
        self.assertEqual(unit_17.name, "A1701")

    def test_generated_units_copy_the_template_fields(self):
        wizard = self._wizard(self.floor_16)
        wizard.action_generate()
        unit = self.env["majal.unit"].search([("floor_id", "=", self.floor_16.id)])
        self.assertEqual(unit.unit_type_id, self.unit_type)
        self.assertEqual(unit.unit_category, "1br")
        self.assertEqual(unit.bedrooms, 1)
        self.assertEqual(unit.bathrooms, 2)
        self.assertEqual(unit.suite_area, 720)
        self.assertEqual(unit.balcony_area, 90)
        self.assertEqual(unit.list_price, 1180000)
        self.assertEqual(unit.status, "planned")

    def test_a_conflicting_code_blocks_generation_for_every_selected_floor(self):
        """Non-vacuous check that this is all-or-nothing: floor 17 has no
        conflict, but floor 16 does, and neither unit should exist after
        the refusal -- a partial generation would be worse than none,
        since it would look like both floors succeeded at a glance."""
        self.env["majal.unit"].create(
            {"name": "A1601", "floor_id": self.floor_16.id})
        wizard = self._wizard(self.floor_16 + self.floor_17)
        with self.assertRaises(UserError):
            wizard.action_generate()
        self.assertFalse(
            self.env["majal.unit"].search([("floor_id", "=", self.floor_17.id)]))

    def test_rerunning_with_a_different_suffix_does_not_conflict(self):
        """Running the wizard twice with different suffixes is the intended
        way to place two unit types on the same floor."""
        self._wizard(self.floor_16).action_generate()
        second_type = self.env["majal.unit.type"].create({
            "name": "2BR Type B", "development_id": self.development.id,
            "unit_category": "2br", "bedrooms": 2, "bathrooms": 3,
            "suite_area": 1030, "balcony_area": 140, "typical_price": 1850000,
        })
        second_wizard = self._wizard(
            self.floor_16, unit_type_id=second_type.id, code_suffix="02")
        second_wizard.action_generate()
        units = self.env["majal.unit"].search(
            [("floor_id", "=", self.floor_16.id)], order="name")
        self.assertEqual(units.mapped("name"), ["A1601", "A1602"])
