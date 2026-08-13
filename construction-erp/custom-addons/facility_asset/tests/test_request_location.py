"""Where a work order is, when it has no asset to ask.

A request's location used to be copied from its equipment and nowhere
else, so anything reported without an asset — which is everything an
occupant reports — was nowhere at all: missing from the location's open
work count, from its work list, and from the rules that decide which FM
staff can see it.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestRequestLocation(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.tower = cls.env["facility.location"].create(
            {"name": "Test Tower", "location_type": "site"})
        cls.level_3 = cls.env["facility.location"].create({
            "name": "Level 3", "location_type": "floor",
            "parent_id": cls.tower.id,
        })
        cls.level_4 = cls.env["facility.location"].create({
            "name": "Level 4", "location_type": "floor",
            "parent_id": cls.tower.id,
        })
        cls.chiller = cls.env["maintenance.equipment"].create({
            "name": "Chiller 1", "facility_location_id": cls.level_3.id})

    def _request(self, **vals):
        return self.env["maintenance.request"].create({
            "name": "Something is wrong", **vals})

    def test_a_request_on_an_asset_inherits_the_assets_location(self):
        request = self._request(equipment_id=self.chiller.id)
        self.assertEqual(request.facility_location_id, self.level_3)

    def test_moving_the_asset_moves_its_open_requests(self):
        request = self._request(equipment_id=self.chiller.id)
        self.chiller.facility_location_id = self.level_4
        self.assertEqual(request.facility_location_id, self.level_4)

    def test_a_request_without_an_asset_can_hold_a_location_of_its_own(self):
        request = self._request(facility_location_id=self.level_3.id)
        self.assertEqual(request.facility_location_id, self.level_3)

    def test_a_hand_set_location_survives_an_unrelated_write(self):
        """The regression this whole change exists to prevent: a recompute
        that assigns False would silently empty the field."""
        request = self._request(facility_location_id=self.level_3.id)
        request.write({"description": "Occupant called again"})
        request.invalidate_recordset()
        self.assertEqual(request.facility_location_id, self.level_3)

    def test_attaching_an_asset_later_takes_the_assets_location(self):
        """Documented as intended: once there is an asset, the asset is the
        better answer to where the work is."""
        request = self._request(facility_location_id=self.level_4.id)
        request.equipment_id = self.chiller
        self.assertEqual(request.facility_location_id, self.level_3)

    def test_the_location_counts_requests_that_have_no_asset(self):
        before = self.level_3.open_request_count
        self._request(facility_location_id=self.level_3.id)
        self.level_3.invalidate_recordset()
        self.assertEqual(self.level_3.open_request_count, before + 1)

    def test_asset_less_requests_roll_up_to_the_parent_location(self):
        before = self.tower.open_request_count
        self._request(facility_location_id=self.level_3.id)
        self.tower.invalidate_recordset()
        self.assertEqual(self.tower.open_request_count, before + 1)
