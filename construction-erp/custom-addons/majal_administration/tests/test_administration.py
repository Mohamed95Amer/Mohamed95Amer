from contextlib import contextmanager
from unittest.mock import patch

import odoo
from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import TransactionCase


@contextmanager
def _borrowed(cursor):
    """Hand out an existing cursor without closing it on the way out."""
    yield cursor


class _BorrowingRegistry:
    """Stands in for odoo.registry(db) and lends the test's own cursor.

    _record_failure asks the registry for a cursor precisely so its write
    lands outside the transaction that is about to be rolled back. A test
    cannot follow it there — a genuinely separate transaction cannot see the
    snapshot this test created and has not committed. So the cursor is
    swapped for the test's own, which keeps the write observable, and the
    request count records that a second cursor was asked for at all.
    """

    def __init__(self, cursor):
        self._cursor = cursor
        self.requests = 0

    def cursor(self):
        self.requests += 1
        return _borrowed(self._cursor)


class TestMajalAdministration(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.owner_role = cls.env.ref(
            "majal_administration.role_platform_owner"
        )
        cls.admin_role = cls.env.ref(
            "majal_administration.role_company_admin"
        )
        cls.field_role = cls.env.ref("majal_administration.role_field_user")
        cls.users = cls.env["res.users"].with_context(no_reset_password=True)

        cls.company_admin = cls.users.create(
            {
                "name": "Test Company Admin",
                "login": "test-company-admin@majal.local",
                "company_id": cls.env.company.id,
                "company_ids": [(6, 0, [cls.env.company.id])],
            }
        )
        cls.company_admin._majal_apply_role(cls.admin_role, "both")
        cls.field_user = cls.users.create(
            {
                "name": "Test Field User",
                "login": "test-field-user@majal.local",
                "company_id": cls.env.company.id,
                "company_ids": [(6, 0, [cls.env.company.id])],
            }
        )
        cls.field_user._majal_apply_role(cls.field_role, "construction")

    def test_company_admin_can_assign_lower_role(self):
        self.field_user.with_user(self.company_admin)._majal_apply_role(
            self.field_role, "facilities"
        )
        self.assertEqual(self.field_user.majal_industry_scope, "facilities")
        self.assertTrue(
            self.field_user.has_group(
                "majal_administration.group_facilities_user"
            )
        )
        self.assertFalse(
            self.field_user.has_group(
                "construction_base.group_construction_user"
            )
        )

    def test_company_admin_cannot_assign_owner(self):
        with self.assertRaises(AccessError):
            self.field_user.with_user(self.company_admin)._majal_apply_role(
                self.owner_role, "both"
            )

    def test_company_admin_cannot_write_raw_groups(self):
        with self.assertRaises(AccessError):
            self.field_user.with_user(self.company_admin).write(
                {
                    "groups_id": [
                        (
                            4,
                            self.env.ref("base.group_system").id,
                        )
                    ]
                }
            )

    def test_context_flag_does_not_unlock_raw_groups(self):
        # The guard used to stand down whenever `majal_role_application` was in
        # the context, and context travels with the RPC call — so whoever was
        # being guarded could simply ask for the exemption.
        #
        # It takes a technical administrator to reach the hole: group_user_
        # administrator implies only base.group_user, so an ordinary Company
        # Administrator is stopped by Odoo's own res.users ACL long before this
        # guard is consulted. Give the actor base.group_erp_manager and the ACL
        # steps aside, leaving this guard as the only thing between a Majal
        # user administrator and a raw groups_id write.
        administrator = self.users.create(
            {
                "name": "Delegated User Administrator",
                "login": "delegated-user-admin@majal.local",
                "company_id": self.env.company.id,
                "company_ids": [(6, 0, [self.env.company.id])],
                "groups_id": [
                    (
                        4,
                        self.env.ref(
                            "majal_administration.group_user_administrator"
                        ).id,
                    ),
                    (4, self.env.ref("base.group_erp_manager").id),
                ],
            }
        )
        self.assertFalse(
            administrator.has_group(
                "majal_administration.group_platform_owner"
            )
        )
        with self.assertRaises(AccessError):
            self.field_user.with_user(administrator).with_context(
                majal_role_application=True
            ).write(
                {"groups_id": [(4, self.env.ref("base.group_system").id)]}
            )
        self.assertFalse(self.field_user.has_group("base.group_system"))

    def test_company_admin_cannot_touch_technical_administrator(self):
        # No majal_role_id, so the rank comparison has nothing to compare, and
        # not a platform owner either: this account used to pass both target
        # guards. Applying a role to it strips base.group_system on the way
        # through, which demotes the person who administers the system.
        technical = self.users.create(
            {
                "name": "Technical Administrator",
                "login": "technical-admin@majal.local",
                "company_id": self.env.company.id,
                "company_ids": [(6, 0, [self.env.company.id])],
                "groups_id": [
                    (4, self.env.ref("base.group_user").id),
                    (4, self.env.ref("base.group_system").id),
                ],
            }
        )
        self.assertFalse(technical.majal_role_id)
        with self.assertRaises(AccessError):
            technical.with_user(self.company_admin)._majal_apply_role(
                self.field_role, "construction"
            )
        self.assertTrue(technical.has_group("base.group_system"))

    def test_owner_demotion_removes_technical_administration(self):
        promoted = self.users.create(
            {
                "name": "Temporary Owner",
                "login": "temporary-owner@majal.local",
                "company_id": self.env.company.id,
                "company_ids": [(6, 0, [self.env.company.id])],
            }
        )
        promoted._majal_apply_role(self.owner_role, "both")
        self.assertTrue(promoted.has_group("base.group_system"))
        promoted._majal_apply_role(self.field_role, "construction")
        self.assertFalse(promoted.has_group("base.group_system"))
        self.assertFalse(
            promoted.has_group("majal_administration.group_platform_owner")
        )

    def test_failed_backup_is_recorded_outside_the_rolled_back_transaction(self):
        snapshots = self.env["majal.backup.snapshot"].sudo()
        today = snapshots.search([("slot", "=", "today")], limit=1)
        if not today:
            today = snapshots.create({"name": "Today", "slot": "today"})
        today.write({"state": "verified"})

        registry = _BorrowingRegistry(self.env.cr)
        with patch.object(odoo, "registry", return_value=registry):
            snapshots._record_failure(RuntimeError("pg_dump went missing"))

        self.assertEqual(registry.requests, 1)
        # The write went through a second Environment, so this one's cache
        # still holds the value from before it.
        today.invalidate_recordset()
        self.assertEqual(today.state, "error")
        self.assertIn("pg_dump went missing", today.error_message)

    def test_recording_a_failure_never_displaces_the_original_error(self):
        # The bookkeeping is the less useful of the two errors and must not
        # replace the one on its way up.
        snapshots = self.env["majal.backup.snapshot"].sudo()
        with patch.object(
            odoo, "registry", side_effect=RuntimeError("no registry")
        ):
            snapshots._record_failure(RuntimeError("the real failure"))

    def test_dump_timeout_is_not_the_http_request_budget(self):
        snapshots = self.env["majal.backup.snapshot"].sudo()
        parameter = self.env["ir.config_parameter"].sudo()

        # limit_time_real is 120 in both shipped configs; the default here has
        # to be a database-dump number, not a web-request one.
        self.assertGreater(
            snapshots._dump_timeout(),
            odoo.tools.config.get("limit_time_real", 120),
        )

        parameter.set_param("majal.backup_dump_timeout_s", "900")
        self.assertEqual(snapshots._dump_timeout(), 900)

        # No timeout at all is a legitimate answer for a very large database.
        parameter.set_param("majal.backup_dump_timeout_s", "0")
        self.assertIsNone(snapshots._dump_timeout())

        parameter.set_param("majal.backup_dump_timeout_s", "soon")
        self.assertEqual(snapshots._dump_timeout(), 3600)

    def test_backup_path_cannot_escape_data_volume(self):
        parameter = self.env["ir.config_parameter"].sudo()
        parameter.set_param("majal.backup_root", "/tmp/outside-majal-data")
        with self.assertRaises(ValidationError):
            self.env["majal.backup.snapshot"]._backup_root()
