"""Whether anyone in Facilities can actually see what Property published.

This is the decisive test of the whole bridge. majal_administration builds
its facilities record rules out of exact paths on facility.location --
manager_user_id and member_user_ids, no hierarchy traversal -- and applies
them to anyone below manager rank. A mirrored room with both fields empty
exists, reads correctly in the ORM as admin, and is invisible to every
technician who would ever work it.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityVisibility(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.field_role = cls.env.ref("majal_administration.role_field_user")

        cls.technician = cls._fm_user("bridge.tech", "Assigned Technician")
        cls.outsider = cls._fm_user("bridge.outsider", "Unassigned Technician")

        cls.development = cls.env["majal.development"].create({
            "name": "Visibility Heights", "code": "VIS",
            "facility_member_user_ids": [(6, 0, [cls.technician.id])],
        })
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower V", "code": "V", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 2", "number": 2, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "V-0201", "floor_id": cls.floor.id, "status": "available"})
        cls.unit.action_publish_to_facilities()

    @classmethod
    def _fm_user(cls, login, name):
        user = cls.env["res.users"].create({
            "name": name, "login": login, "email": f"{login}@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("base.group_user").id,
                cls.env.ref("maintenance.group_equipment_manager").id,
            ])],
        })
        user.write({
            "majal_role_id": cls.env.ref("majal_administration.role_field_user").id,
            "majal_industry_scope": "facilities",
        })
        return user

    def test_the_assigned_team_is_stamped_all_the_way_down(self):
        for record in (self.development, self.building, self.floor, self.unit):
            location = record.facility_location_id
            self.assertIn(
                self.technician, location.member_user_ids,
                f"{location.complete_name} did not receive the FM team")

    def test_an_assigned_technician_can_read_the_unit_level_location(self):
        location = self.unit.facility_location_id.with_user(self.technician)
        self.assertEqual(location.read(["complete_name"])[0]["id"], location.id)

    def test_an_unassigned_technician_cannot(self):
        visible = self.env["facility.location"].with_user(self.outsider).search(
            [("id", "=", self.unit.facility_location_id.id)])
        self.assertFalse(visible)

    def test_a_work_order_on_a_published_unit_reaches_the_assigned_team(self):
        work_order = self.env["maintenance.request"].create({
            "name": "Leak in V-0201",
            "facility_location_id": self.unit.facility_location_id.id,
        })
        visible = self.env["maintenance.request"].with_user(self.technician).search(
            [("id", "=", work_order.id)])
        self.assertEqual(visible, work_order)

    def test_adding_someone_to_the_team_reaches_locations_already_published(self):
        newcomer = self._fm_user("bridge.newcomer", "Newcomer")
        self.development.facility_member_user_ids = [(4, newcomer.id)]
        visible = self.env["facility.location"].with_user(newcomer).search(
            [("id", "=", self.unit.facility_location_id.id)])
        self.assertEqual(visible, self.unit.facility_location_id)

    def test_the_bridge_never_stamps_a_hand_made_facilities_location(self):
        """Over-stamping would grant access to locations somebody scoped by
        hand, so the bridge only ever writes to locations it created.

        Asserted against the bridge's own set rather than the end state of
        member_user_ids: where majal_workforce is installed it deliberately
        projects allocation membership down the whole subtree, so a child of
        a published site can legitimately gain members from elsewhere.
        """
        plant_room = self.env["facility.location"].create({
            "name": "Chiller Plant",
            "location_type": "room",
            "parent_id": self.development.facility_location_id.id,
        })
        self.assertFalse(plant_room.majal_development_id)
        self.assertNotIn(plant_room, self.development._mirrored_locations())

        self.development.facility_member_user_ids = [(4, self.outsider.id)]
        self.assertNotIn(plant_room, self.development._mirrored_locations())

    def test_a_portal_user_is_never_given_a_facilities_assignment(self):
        buyer = self.env["res.users"].create({
            "name": "Portal Buyer", "login": "bridge.portal",
            "email": "bridge.portal@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [self.env.ref("base.group_portal").id])],
        })
        self.development.facility_member_user_ids = [(4, buyer.id)]
        self.assertNotIn(
            buyer, self.unit.facility_location_id.member_user_ids)
