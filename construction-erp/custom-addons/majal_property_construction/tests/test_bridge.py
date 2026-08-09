"""Where Construction and Property meet.

The bridge is only worth having if the two sides actually move each
other: a slipped taking-over date has to move the buyers' handover
payments, and the site's punch list has to be the same list the handover
inspection works from.
"""

from datetime import timedelta

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPropertyConstructionBridge(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.development"])
        cls.project = cls.env["project.project"].create({
            "name": "Marina Heights Construction (test)",
            "is_construction": True,
            "date_taking_over": cls.today + timedelta(days=540),
        })
        cls.development = cls.env["majal.development"].create({
            "name": "Marina Heights (test)", "code": "MHTEST",
            "project_id": cls.project.id,
            "expected_handover_date": cls.today + timedelta(days=540),
        })
        cls.building = cls.env["majal.building"].create({
            "name": "Tower A", "code": "A",
            "development_id": cls.development.id,
        })
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "A-1601", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available",
        })
        cls.buyer = cls.env["res.partner"].create({"name": "Test Buyer"})
        cls.plan = cls.env["majal.payment.plan"].create({
            "name": "50 booking / 50 handover",
            "line_ids": [
                (0, 0, {"sequence": 10, "name": "On booking", "percentage": 50,
                        "trigger": "booking"}),
                (0, 0, {"sequence": 20, "name": "On handover", "percentage": 50,
                        "trigger": "handover"}),
            ],
        })

    def _scheduled_reservation(self):
        reservation = self.env["majal.reservation"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
            "sale_price": 1000000,
            "payment_plan_id": self.plan.id,
        })
        reservation.action_generate_schedule()
        return reservation

    # --- Project link ------------------------------------------------------

    def test_a_project_reports_the_developments_it_delivers(self):
        self.assertEqual(self.project.development_ids, self.development)
        self.assertEqual(self.project.development_count, 1)
        self.assertEqual(self.project.property_unit_count, 1)

    def test_pulling_the_handover_date_adopts_the_taking_over_date(self):
        self.development.expected_handover_date = self.today
        self.development.action_pull_handover_date()
        self.assertEqual(
            self.development.expected_handover_date, self.project.date_taking_over)

    def test_pulling_a_date_from_a_project_that_has_none_is_refused(self):
        self.project.date_taking_over = False
        with self.assertRaises(UserError):
            self.development.action_pull_handover_date()

    # --- The link that costs money ----------------------------------------

    def test_a_slipped_taking_over_date_moves_unpaid_handover_installments(self):
        """This is the whole reason the two sides are linked: construction
        slipping is not just a construction problem, it moves when every
        buyer owes their handover payment."""
        reservation = self._scheduled_reservation()
        handover_installment = reservation.installment_ids.filtered(
            lambda i: i.trigger == "handover")
        booking_installment = reservation.installment_ids.filtered(
            lambda i: i.trigger == "booking")
        original_booking_date = booking_installment.due_date

        new_date = self.today + timedelta(days=700)
        self.project.date_taking_over = new_date

        self.assertEqual(self.development.expected_handover_date, new_date)
        self.assertEqual(handover_installment.due_date, new_date)
        # A booking milestone has nothing to do with handover and must not
        # be dragged along with it.
        self.assertEqual(booking_installment.due_date, original_booking_date)

    def test_a_paid_handover_installment_is_left_where_it_is(self):
        """The date on a payment already made is a record of what happened,
        not a plan that can be revised."""
        reservation = self._scheduled_reservation()
        handover_installment = reservation.installment_ids.filtered(
            lambda i: i.trigger == "handover")
        handover_installment.action_mark_paid()
        paid_date = handover_installment.due_date

        self.project.date_taking_over = self.today + timedelta(days=700)
        self.assertEqual(handover_installment.due_date, paid_date)

    # --- Buildings ---------------------------------------------------------

    def test_a_building_cannot_sit_under_a_different_project_than_its_development(self):
        other_project = self.env["project.project"].create(
            {"name": "Some Other Site", "is_construction": True})
        with self.assertRaises(ValidationError):
            self.building.project_id = other_project

    def test_a_building_may_share_its_developments_project(self):
        self.building.project_id = self.project
        self.assertEqual(self.building.project_id, self.project)

    # --- Punch items -------------------------------------------------------

    def _defect(self, **vals):
        return self.env["construction.defect"].create({
            "name": "Chipped worktop",
            "project_id": self.project.id,
            "unit_id": self.unit.id,
            "phase": "punch",
            **vals,
        })

    def _handover(self):
        return self.env["majal.handover"].create({
            "unit_id": self.unit.id,
            "partner_id": self.buyer.id,
        })

    def test_importing_site_punch_items_fills_the_handover_snag_list(self):
        defect = self._defect(severity="high")
        handover = self._handover()
        self.assertEqual(handover.site_defect_count, 1)

        handover.action_import_site_defects()
        self.assertEqual(len(handover.snag_ids), 1)
        snag = handover.snag_ids
        self.assertEqual(snag.name, defect.name)
        self.assertEqual(snag.severity, "high")
        self.assertEqual(snag.defect_id, defect)

    def test_a_critical_site_defect_lands_as_a_high_severity_snag(self):
        self._defect(severity="critical")
        handover = self._handover()
        handover.action_import_site_defects()
        self.assertEqual(handover.snag_ids.severity, "high")

    def test_importing_twice_does_not_duplicate_the_snag_list(self):
        self._defect()
        handover = self._handover()
        handover.action_import_site_defects()
        with self.assertRaises(UserError):
            handover.action_import_site_defects()
        self.assertEqual(len(handover.snag_ids), 1)

    def test_a_closed_site_defect_is_not_imported(self):
        """It was already dealt with on site; re-raising it at handover
        would block a unit over work that is done."""
        defect = self._defect()
        defect.state = "closed"
        handover = self._handover()
        self.assertEqual(handover.site_defect_count, 0)
        with self.assertRaises(UserError):
            handover.action_import_site_defects()

    def test_a_site_wide_defect_belongs_to_no_unit_and_is_not_imported(self):
        self._defect(unit_id=False)
        handover = self._handover()
        self.assertEqual(handover.site_defect_count, 0)

    def test_imported_snags_still_block_the_handover_until_verified(self):
        self._defect()
        handover = self._handover()
        handover.scheduled_date = self.today
        handover.action_schedule()
        handover.action_start_inspection()
        handover.action_import_site_defects()
        with self.assertRaises(UserError):
            handover.action_mark_ready()
