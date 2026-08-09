"""Leases, rent schedules and the unit's occupancy.

A lease owns whether a unit is occupied in the same way a reservation
owns whether it is available, so the rules are the same shape: only one
live lease at a time, and the unit follows the lease rather than the
other way round.
"""

from datetime import timedelta

from dateutil.relativedelta import relativedelta
from psycopg2 import IntegrityError

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tools import mute_logger


@tagged("post_install", "-at_install")
class TestLease(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["majal.lease"])
        cls.development = cls.env["majal.development"].create(
            {"name": "Marina Heights (test)", "code": "MHTEST"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower A", "code": "A", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 16", "number": 16, "building_id": cls.building.id})
        cls.unit = cls.env["majal.unit"].create({
            "name": "A-1601", "floor_id": cls.floor.id,
            "list_price": 1000000, "status": "available",
        })
        cls.tenant = cls.env["res.partner"].create({"name": "Test Tenant"})
        cls.other_tenant = cls.env["res.partner"].create({"name": "Other Tenant"})

    def _lease(self, **vals):
        return self.env["majal.lease"].create({
            "unit_id": self.unit.id,
            "tenant_id": self.tenant.id,
            "start_date": self.today,
            "end_date": self.today + relativedelta(years=1, days=-1),
            "frequency": "quarterly",
            "annual_rent": 120000,
            **vals,
        })

    def _active_lease(self, **vals):
        lease = self._lease(**vals)
        lease.action_generate_rent_schedule()
        lease.action_activate()
        return lease

    # --- Rent schedule -----------------------------------------------------

    def test_a_year_at_quarterly_billing_produces_four_equal_instalments(self):
        lease = self._lease()
        lease.action_generate_rent_schedule()
        lines = lease.rent_line_ids
        self.assertEqual(len(lines), 4)
        self.assertEqual(lines.mapped("amount"), [30000, 30000, 30000, 30000])
        self.assertEqual(lease.amount_scheduled, 120000)
        self.assertEqual(lines[0].due_date, lease.start_date)

    def test_a_short_final_period_is_billed_for_the_days_it_covers(self):
        """A 14-month lease billed annually ends on a two-month stub. Billing
        that as a full year would overcharge the tenant by ten months."""
        lease = self._lease(
            frequency="annual",
            end_date=self.today + relativedelta(months=14, days=-1),
        )
        lease.action_generate_rent_schedule()
        lines = lease.rent_line_ids
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].amount, 120000)
        self.assertLess(lines[1].amount, 120000 / 4)
        self.assertGreater(lines[1].amount, 0)

    def test_regenerating_is_refused_once_rent_has_been_received(self):
        lease = self._lease()
        lease.action_generate_rent_schedule()
        lease.rent_line_ids[0].action_mark_paid()
        with self.assertRaises(UserError):
            lease.action_generate_rent_schedule()
        self.assertEqual(len(lease.rent_line_ids), 4)

    def test_rent_totals_and_arrears_roll_up_to_the_lease(self):
        lease = self._lease()
        lease.action_generate_rent_schedule()
        lease.rent_line_ids[0].action_mark_paid()
        self.assertEqual(lease.amount_paid, 30000)
        self.assertEqual(lease.amount_residual, 90000)
        self.assertEqual(lease.next_due_date, lease.rent_line_ids[1].due_date)

    def test_overdue_rent_is_flagged_and_searchable(self):
        lease = self._lease(
            start_date=self.today - relativedelta(months=6),
            end_date=self.today + relativedelta(months=6, days=-1),
        )
        lease.action_generate_rent_schedule()
        overdue = lease.rent_line_ids.filtered("is_overdue")
        self.assertTrue(overdue)
        searched = self.env["majal.lease.rent.line"].search([
            ("lease_id", "=", lease.id), ("is_overdue", "=", True)])
        self.assertEqual(searched, overdue)

    # --- Occupancy ---------------------------------------------------------

    def test_activating_a_lease_marks_the_unit_leased(self):
        lease = self._active_lease()
        self.assertEqual(lease.state, "active")
        self.assertEqual(self.unit.status, "leased")
        self.assertEqual(self.unit.active_lease_id, lease)
        self.assertEqual(self.unit.tenant_id, self.tenant)

    def test_a_lease_cannot_be_activated_without_a_rent_schedule(self):
        """Activating without a schedule would put a tenant in a unit with
        nothing recorded as owed."""
        lease = self._lease()
        with self.assertRaises(UserError):
            lease.action_activate()

    def test_terminating_returns_the_unit_to_the_vacant_pool(self):
        lease = self._active_lease()
        lease.action_terminate()
        self.assertEqual(lease.state, "terminated")
        self.assertEqual(self.unit.status, "vacant")
        self.assertFalse(self.unit.active_lease_id)
        self.assertTrue(lease.termination_date)

    def test_an_active_lease_is_terminated_not_cancelled(self):
        lease = self._active_lease()
        with self.assertRaises(UserError):
            lease.action_cancel()

    def test_an_active_lease_cannot_be_deleted(self):
        lease = self._active_lease()
        with self.assertRaises(UserError):
            lease.unlink()

    @mute_logger("odoo.sql_db")
    def test_a_unit_cannot_carry_two_active_leases(self):
        """Two active leases would each believe their tenant has the keys.
        Only the database can refuse the second under concurrency."""
        self._active_lease()
        second = self._lease(
            tenant_id=self.other_tenant.id,
            start_date=self.today + relativedelta(years=2),
            end_date=self.today + relativedelta(years=3),
        )
        with self.assertRaises(IntegrityError):
            with self.env.cr.savepoint():
                second.write({"state": "active"})
                second.flush_recordset()

    def test_a_future_lease_cannot_overlap_a_live_one(self):
        """The unique index only sees two leases active at the same moment;
        it cannot see that a booked renewal overlaps the current term."""
        self._active_lease()
        with self.assertRaises(ValidationError):
            self._lease(
                tenant_id=self.other_tenant.id,
                start_date=self.today + relativedelta(months=6),
                end_date=self.today + relativedelta(months=18),
            )

    def test_a_lease_starting_after_the_current_one_ends_is_allowed(self):
        current = self._active_lease()
        follow_on = self._lease(
            tenant_id=self.other_tenant.id,
            start_date=current.end_date + timedelta(days=1),
            end_date=current.end_date + relativedelta(years=1),
        )
        self.assertTrue(follow_on.id)

    def test_a_lease_must_end_after_it_starts(self):
        with self.assertRaises(ValidationError):
            self._lease(end_date=self.today - timedelta(days=1))

    # --- Renewal and expiry ------------------------------------------------

    def test_renewing_opens_a_follow_on_lease_the_day_after_this_one_ends(self):
        lease = self._active_lease()
        action = lease.action_renew()
        renewal = self.env["majal.lease"].browse(action["res_id"])
        self.assertEqual(renewal.start_date, lease.end_date + timedelta(days=1))
        self.assertEqual(renewal.tenant_id, self.tenant)
        self.assertEqual(renewal.annual_rent, lease.annual_rent)
        self.assertEqual(renewal.renewed_from_id, lease)
        self.assertEqual(lease.renewal_ids, renewal)

    def test_the_expiry_cron_ends_lapsed_leases_and_frees_their_units(self):
        lease = self._active_lease(
            start_date=self.today - relativedelta(years=2),
            end_date=self.today - relativedelta(years=1),
        )
        self.env["majal.lease"]._cron_expire_leases()
        self.assertEqual(lease.state, "expired")
        self.assertEqual(self.unit.status, "vacant")

    def test_a_live_lease_is_left_alone_by_the_expiry_cron(self):
        lease = self._active_lease()
        self.env["majal.lease"]._cron_expire_leases()
        self.assertEqual(lease.state, "active")
        self.assertEqual(self.unit.status, "leased")

    # --- Maintenance -------------------------------------------------------

    def test_a_maintenance_request_counts_against_the_unit_until_it_is_closed(self):
        self._active_lease()
        request = self.env["majal.maintenance.request"].create({
            "name": "AC not cooling",
            "unit_id": self.unit.id,
            "partner_id": self.tenant.id,
            "category": "hvac",
        })
        self.assertEqual(self.unit.open_maintenance_count, 1)
        request.action_start()
        self.assertEqual(self.unit.open_maintenance_count, 1)
        request.action_done()
        self.assertEqual(self.unit.open_maintenance_count, 0)
        self.assertTrue(request.closed_date)
