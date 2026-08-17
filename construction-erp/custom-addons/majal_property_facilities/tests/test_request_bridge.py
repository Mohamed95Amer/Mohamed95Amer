"""A tenant's report and the work order that answers it.

They are kept as two records on purpose: the report is a claim on the
landlord, the work order is the labour and parts that settle it. One
report can need three work orders, and the tenant should never see the
contractor's cost lines. What has to be true is that closure is owned in
exactly one place.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestRequestBridge(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.development = cls.env["majal.development"].create(
            {"name": "Bridge Heights", "code": "BRIDGE"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower B", "code": "B", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 9", "number": 9, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "B-0901", "floor_id": cls.floor.id, "status": "available"})
        cls.tenant = cls.env["res.partner"].create({"name": "Bridge Tenant"})
        cls.done_stage = cls.env["maintenance.stage"].search(
            [("done", "=", True)], limit=1)
        cls.open_stage = cls.env["maintenance.stage"].search(
            [("done", "=", False)], limit=1)

    def _report(self, **vals):
        return self.env["majal.maintenance.request"].create({
            "name": "AC not cooling",
            "unit_id": self.unit.id,
            "partner_id": self.tenant.id,
            "category": "hvac",
            **vals,
        })

    def test_escalating_raises_a_work_order_located_at_the_unit(self):
        """There is no asset yet — just a flat with a problem in it — so the
        work order is located directly. That only works because a request's
        location is writable in its own right."""
        report = self._report()
        report.action_escalate_to_facilities()

        work_order = report.maintenance_request_id
        self.assertTrue(work_order)
        self.assertFalse(work_order.equipment_id)
        self.assertEqual(
            work_order.facility_location_id, self.unit.facility_location_id)
        self.assertEqual(work_order.majal_unit_id, self.unit)
        self.assertEqual(work_order.majal_request_id, report)
        self.assertEqual(work_order.majal_tenant_partner_id, self.tenant)

    def test_escalating_publishes_the_unit_if_it_was_not_already(self):
        self.assertFalse(self.unit.facility_location_id)
        self._report().action_escalate_to_facilities()
        self.assertTrue(self.unit.facility_location_id)

    def test_a_report_cannot_be_escalated_twice(self):
        report = self._report()
        report.action_escalate_to_facilities()
        with self.assertRaises(UserError):
            report.action_escalate_to_facilities()

    def test_priority_is_mapped_across_the_two_scales(self):
        """Property runs 0-2 and Facilities 0-3."""
        report = self._report(priority="2")
        report.action_escalate_to_facilities()
        self.assertEqual(report.maintenance_request_id.priority, "2")

    def test_closing_the_work_order_closes_the_tenants_report(self):
        report = self._report()
        report.action_escalate_to_facilities()
        report.maintenance_request_id.stage_id = self.done_stage

        self.assertEqual(report.state, "done")
        self.assertTrue(report.closed_date)

    def test_reopening_the_work_order_reopens_the_report(self):
        report = self._report()
        report.action_escalate_to_facilities()
        work_order = report.maintenance_request_id
        work_order.stage_id = self.done_stage
        work_order.stage_id = self.open_stage

        self.assertEqual(report.state, "in_progress")
        self.assertFalse(report.closed_date)

    def test_the_report_cannot_be_closed_while_its_work_order_is_open(self):
        """Two systems cannot both own the moment a job is finished."""
        report = self._report()
        report.action_escalate_to_facilities()
        with self.assertRaises(UserError):
            report.action_done()

    def test_a_report_with_no_work_order_still_closes_normally(self):
        report = self._report()
        report.action_start()
        report.action_done()
        self.assertEqual(report.state, "done")

    def test_cancelling_the_report_leaves_the_work_order_open(self):
        """A tenant withdrawing a complaint does not make a half-dismantled
        riser safe."""
        report = self._report()
        report.action_escalate_to_facilities()
        report.action_cancel()

        self.assertEqual(report.state, "cancelled")
        self.assertFalse(report.maintenance_request_id.stage_id.done)

    def test_an_asset_in_a_published_unit_knows_its_unit_and_owner(self):
        owner = self.env["res.partner"].create({"name": "Bridge Owner"})
        self.unit.action_publish_to_facilities()
        self.unit.owner_id = owner
        equipment = self.env["maintenance.equipment"].create({
            "name": "Split AC",
            "facility_location_id": self.unit.facility_location_id.id,
        })
        self.assertEqual(equipment.majal_unit_id, self.unit)
        self.assertEqual(equipment.majal_owner_partner_id, owner)
        self.assertEqual(equipment.majal_development_id, self.development)

    def test_the_occupant_on_an_asset_follows_the_lease(self):
        self.unit.action_publish_to_facilities()
        equipment = self.env["maintenance.equipment"].create({
            "name": "Split AC",
            "facility_location_id": self.unit.facility_location_id.id,
        })
        lease = self.env["majal.lease"].create({
            "unit_id": self.unit.id,
            "tenant_id": self.tenant.id,
            "start_date": self.env.cr.now().date(),
            "end_date": self.env.cr.now().date().replace(
                year=self.env.cr.now().date().year + 1),
            "annual_rent": 90000,
        })
        lease.action_generate_rent_schedule()
        lease.action_activate()
        equipment.invalidate_recordset()
        self.assertEqual(equipment.majal_occupant_partner_id, self.tenant)

        lease.action_terminate()
        equipment.invalidate_recordset()
        self.assertFalse(equipment.majal_occupant_partner_id)
