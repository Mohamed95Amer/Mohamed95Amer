"""Property records appearing in the Facilities location tree.

The rule the whole design turns on: a unit is an FM object when somebody
has to maintain it, not when it is typed in. So nothing is mirrored until
it is published, and once published the mirror follows the property
record rather than drifting from it.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityMirror(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Mirror Heights", "code": "MIRROR"})
        cls.community = cls.env["majal.community"].create(
            {"name": "Marina Cluster", "development_id": cls.development.id})
        cls.building = cls.env["majal.building"].create({
            "name": "Tower A", "code": "A",
            "development_id": cls.development.id,
            "community_id": cls.community.id,
        })
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "A-1601", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available",
        })

    def test_nothing_is_mirrored_until_it_is_published(self):
        """The argument for publishing rather than auto-mirroring, in one
        assertion: a 900-unit off-plan tower creates nothing."""
        self.assertFalse(self.unit.facility_location_id)
        self.assertFalse(self.development.facility_location_id)
        self.assertEqual(self.development.facility_location_count, 0)

    def test_publishing_a_unit_builds_the_whole_chain_above_it(self):
        self.unit.action_publish_to_facilities()

        unit_location = self.unit.facility_location_id
        self.assertTrue(unit_location)
        self.assertEqual(unit_location.location_type, "room")
        self.assertEqual(unit_location.parent_id, self.floor.facility_location_id)
        self.assertEqual(self.floor.facility_location_id.location_type, "floor")
        self.assertEqual(
            self.floor.facility_location_id.parent_id,
            self.building.facility_location_id)
        self.assertEqual(self.building.facility_location_id.location_type, "building")
        self.assertEqual(
            self.building.facility_location_id.parent_id,
            self.community.facility_location_id)
        self.assertEqual(self.community.facility_location_id.location_type, "zone")
        self.assertEqual(
            self.community.facility_location_id.parent_id,
            self.development.facility_location_id)
        self.assertEqual(self.development.facility_location_id.location_type, "site")
        self.assertFalse(self.development.facility_location_id.parent_id)

    def test_publishing_twice_does_not_duplicate_the_tree(self):
        self.unit.action_publish_to_facilities()
        first = self.unit.facility_location_id
        count = self.development.facility_location_count

        self.unit.action_publish_to_facilities()
        self.development.invalidate_recordset()
        self.assertEqual(self.unit.facility_location_id, first)
        self.assertEqual(self.development.facility_location_count, count)

    def test_the_mirror_carries_the_back_links(self):
        self.unit.action_publish_to_facilities()
        location = self.unit.facility_location_id
        self.assertEqual(location.majal_unit_id, self.unit)
        self.assertEqual(location.majal_building_id, self.building)
        self.assertEqual(location.majal_development_id, self.development)
        self.assertEqual(location.company_id, self.development.company_id)

    def test_renaming_a_building_relabels_everything_beneath_it(self):
        self.unit.action_publish_to_facilities()
        self.building.name = "Tower A (North)"
        self.assertEqual(self.building.facility_location_id.name, "Tower A (North)")
        # complete_name is a stored recursive compute, so the subtree follows.
        self.assertIn("Tower A (North)", self.unit.facility_location_id.complete_name)

    def test_moving_a_unit_to_another_floor_moves_its_mirror(self):
        self.unit.action_publish_to_facilities()
        other_floor = self.env["majal.floor"].create(
            {"name": "Floor 17", "number": 17, "building_id": self.building.id})
        other_floor.action_publish_to_facilities()

        self.unit.floor_id = other_floor
        self.assertEqual(
            self.unit.facility_location_id.parent_id,
            other_floor.facility_location_id)
        self.assertIn(
            "Floor 17", self.unit.facility_location_id.complete_name)

    def test_a_handover_publishes_the_unit_it_completes(self):
        """The automatic trigger: handover is the moment a unit becomes
        somebody's to maintain."""
        buyer = self.env["res.partner"].create({"name": "Mirror Buyer"})
        handover = self.env["majal.handover"].create({
            "unit_id": self.unit.id, "partner_id": buyer.id,
            "scheduled_date": self.env.cr.now().date(),
        })
        handover.action_schedule()
        handover.action_start_inspection()
        handover.action_mark_ready()
        handover.action_complete()

        self.assertTrue(self.unit.facility_location_id)
        self.assertEqual(self.unit.facility_location_id.majal_unit_id, self.unit)

    def test_auto_publish_mirrors_new_units_as_they_are_created(self):
        self.development.facility_auto_publish = True
        unit = self.env["majal.unit"].create({
            "name": "A-1602", "floor_id": self.floor.id, "status": "available"})
        self.assertTrue(unit.facility_location_id)

    def test_deleting_an_empty_unit_archives_its_mirror_rather_than_dropping_it(self):
        self.unit.action_publish_to_facilities()
        location = self.unit.facility_location_id
        self.unit.unlink()
        self.assertTrue(location.exists())
        self.assertFalse(location.active)

    def test_deleting_a_unit_with_maintenance_history_leaves_the_mirror_alone(self):
        """The asset register is the system of record for maintenance history
        and has to outlive the sales system's housekeeping."""
        self.unit.action_publish_to_facilities()
        location = self.unit.facility_location_id
        self.env["maintenance.equipment"].create({
            "name": "Split AC", "facility_location_id": location.id})

        self.unit.unlink()
        self.assertTrue(location.exists())
        self.assertTrue(location.active)
