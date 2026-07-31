import importlib.util
import tempfile
from contextlib import contextmanager
from pathlib import Path
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
_RESTORE_SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "scripts" / "restore_database.py"
)
_RESTORE_SCRIPT_SPEC = importlib.util.spec_from_file_location(
    "majal_restore_database_script",
    _RESTORE_SCRIPT_PATH,
)
_RESTORE_SCRIPT = importlib.util.module_from_spec(_RESTORE_SCRIPT_SPEC)
_RESTORE_SCRIPT_SPEC.loader.exec_module(_RESTORE_SCRIPT)


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
        cls.manager_role = cls.env.ref("majal_administration.role_manager")
        cls.operations_role = cls.env.ref(
            "majal_administration.role_operations_manager"
        )
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

    def test_company_admin_wizard_hides_ungrantable_choices(self):
        wizard = self.env["majal.user.invite.wizard"].with_user(
            self.company_admin
        ).new({"role_id": self.field_role.id})
        role_ids = set(wizard.assignable_role_ids._origin.ids)
        capability_ids = set(
            wizard.assignable_capability_pack_ids._origin.ids
        )
        self.assertIn(self.field_role.id, role_ids)
        self.assertNotIn(self.admin_role.id, role_ids)
        self.assertNotIn(self.owner_role.id, role_ids)
        self.assertIn(
            self.env.ref(
                "majal_administration.capability_procurement_user"
            ).id,
            capability_ids,
        )
        self.assertNotIn(
            self.env.ref(
                "majal_administration.capability_finance_manager"
            ).id,
            capability_ids,
        )

    def test_platform_owner_wizard_can_offer_owner_approved_tier(self):
        wizard = self.env["majal.user.invite.wizard"].new(
            {"role_id": self.operations_role.id}
        )
        role_ids = set(wizard.assignable_role_ids._origin.ids)
        capability_ids = set(
            wizard.assignable_capability_pack_ids._origin.ids
        )
        self.assertIn(self.owner_role.id, role_ids)
        self.assertIn(
            self.env.ref(
                "majal_administration.capability_finance_manager"
            ).id,
            capability_ids,
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
    def test_role_change_strips_unapproved_legacy_groups(self):
        purchase_manager = self.env.ref("purchase.group_purchase_manager")
        self.field_user.sudo().write(
            {"groups_id": [(4, purchase_manager.id)]}
        )
        self.assertTrue(purchase_manager in self.field_user.groups_id)
        self.field_user._majal_apply_role(self.field_role, "construction")
        self.assertFalse(purchase_manager in self.field_user.groups_id)

    def test_company_admin_cannot_manage_another_company(self):
        other_company = self.env["res.company"].create({"name": "Other Tenant"})
        outsider = self.users.sudo().create(
            {
                "name": "Other Tenant User",
                "login": "other-tenant-user@majal.local",
                "company_id": other_company.id,
                "company_ids": [(6, 0, [other_company.id])],
            }
        )
        with self.assertRaises(AccessError):
            outsider.with_user(self.company_admin)._majal_apply_role(
                self.field_role, "construction"
            )

    def test_backup_path_cannot_escape_data_volume(self):
        parameter = self.env["ir.config_parameter"].sudo()
        parameter.set_param("majal.backup_root", "/tmp/outside-majal-data")
        with self.assertRaises(ValidationError):
            self.env["majal.backup.snapshot"]._backup_root()

    def test_restore_scalar_ignores_client_locale_warnings(self):
        output = (
            b"perl: warning: Setting locale failed.\n"
            b"perl: warning: Falling back to the standard locale.\n"
            b"prepared|token-hash|1785312000\n"
        )
        self.assertEqual(
            _RESTORE_SCRIPT.scalar_output(output),
            "prepared|token-hash|1785312000",
        )

    def test_restore_dump_removes_only_transaction_timeout(self):
        source = (
            b"SET statement_timeout = 0;\n"
            b"SET transaction_timeout = 0;\n"
            b"SET lock_timeout = 0;\n"
            b"CREATE TABLE recovery_test (id integer);\n"
        )
        with tempfile.TemporaryDirectory(prefix="majal-restore-test-") as work:
            source_path = Path(work) / "dump.sql"
            destination_path = Path(work) / "dump-compatible.sql"
            source_path.write_bytes(source)
            _RESTORE_SCRIPT.prepare_compatible_dump(
                source_path,
                destination_path,
            )
            self.assertEqual(
                destination_path.read_bytes(),
                (
                    b"SET statement_timeout = 0;\n"
                    b"SET lock_timeout = 0;\n"
                    b"CREATE TABLE recovery_test (id integer);\n"
                ),
            )

    def test_company_admin_assigns_and_removes_user_capability_pack(self):
        procurement = self.env.ref(
            "majal_administration.capability_procurement_user"
        )
        self.field_user.with_user(self.company_admin)._majal_apply_role(
            self.field_role,
            "construction",
            procurement,
        )
        self.assertEqual(
            self.field_user.majal_capability_pack_ids,
            procurement,
        )
        self.assertTrue(
            self.field_user.has_group("purchase.group_purchase_user")
        )
        self.assertFalse(
            self.field_user.has_group("purchase.group_purchase_manager")
        )
        self.assertFalse(self.field_user.has_group("stock.group_stock_user"))

        self.field_user.with_user(self.company_admin)._majal_apply_role(
            self.field_role,
            "construction",
            self.env["majal.capability.pack"],
        )
        self.assertFalse(self.field_user.majal_capability_pack_ids)
        self.assertFalse(
            self.field_user.has_group("purchase.group_purchase_user")
        )

    def test_all_catalogued_capability_tiers_map_to_expected_groups(self):
        supervisor_role = self.env.ref(
            "majal_administration.role_supervisor"
        )
        cases = [
            (
                "capability_procurement_user",
                self.field_role,
                "purchase.group_purchase_user",
            ),
            (
                "capability_procurement_manager",
                self.manager_role,
                "purchase.group_purchase_manager",
            ),
            (
                "capability_inventory_user",
                self.field_role,
                "stock.group_stock_user",
            ),
            (
                "capability_inventory_manager",
                self.manager_role,
                "stock.group_stock_manager",
            ),
            (
                "capability_finance_readonly",
                supervisor_role,
                "account.group_account_readonly",
            ),
            (
                "capability_finance_accountant",
                self.manager_role,
                "account.group_account_user",
            ),
            (
                "capability_finance_manager",
                self.operations_role,
                "account.group_account_manager",
            ),
            (
                "capability_hr_officer",
                self.manager_role,
                "hr.group_hr_user",
            ),
            (
                "capability_hr_manager",
                self.operations_role,
                "hr.group_hr_manager",
            ),
            (
                "capability_website_editor",
                self.manager_role,
                "website.group_website_restricted_editor",
            ),
            (
                "capability_website_designer",
                self.operations_role,
                "website.group_website_designer",
            ),
            (
                "capability_ai_administrator",
                self.manager_role,
                "majal_ai.group_ai_manager",
            ),
        ]
        self.assertEqual(
            self.env["majal.capability.pack"].search_count([]),
            len(cases),
        )
        for external_id, role, expected_group in cases:
            with self.subTest(capability=external_id):
                pack = self.env.ref(
                    "majal_administration.%s" % external_id
                )
                self.field_user._majal_apply_role(
                    role,
                    "both",
                    pack,
                )
                self.assertEqual(
                    self.field_user.majal_capability_pack_ids,
                    pack,
                )
                self.assertTrue(
                    self.field_user.has_group(expected_group),
                    "%s did not grant %s" % (external_id, expected_group),
                )
                unrelated_groups = (
                    self.env["majal.capability.pack"]
                    .search([("family", "!=", pack.family)])
                    .mapped("group_ids")
                )
                self.assertFalse(
                    unrelated_groups & self.field_user.groups_id,
                    "%s leaked an unrelated capability group"
                    % external_id,
                )

    def test_capability_family_allows_only_one_tier(self):
        procurement_user = self.env.ref(
            "majal_administration.capability_procurement_user"
        )
        procurement_manager = self.env.ref(
            "majal_administration.capability_procurement_manager"
        )
        with self.assertRaises(ValidationError):
            self.field_user._majal_apply_role(
                self.manager_role,
                "construction",
                procurement_user | procurement_manager,
            )

    def test_capability_enforces_minimum_majal_role(self):
        procurement_manager = self.env.ref(
            "majal_administration.capability_procurement_manager"
        )
        with self.assertRaises(ValidationError):
            self.field_user._majal_apply_role(
                self.field_role,
                "construction",
                procurement_manager,
            )

    def test_company_admin_cannot_grant_owner_only_capability(self):
        finance_manager = self.env.ref(
            "majal_administration.capability_finance_manager"
        )
        with self.assertRaises(AccessError):
            self.field_user.with_user(self.company_admin)._majal_apply_role(
                self.operations_role,
                "both",
                finance_manager,
            )

    def test_platform_owner_can_grant_finance_administration(self):
        finance_manager = self.env.ref(
            "majal_administration.capability_finance_manager"
        )
        self.field_user._majal_apply_role(
            self.operations_role,
            "both",
            finance_manager,
        )
        self.assertTrue(
            self.field_user.has_group("account.group_account_user")
        )
        self.assertTrue(
            self.field_user.has_group("account.group_account_manager")
        )

    def test_hr_pack_does_not_grant_facilities_administration(self):
        hr_officer = self.env.ref(
            "majal_administration.capability_hr_officer"
        )
        self.field_user.with_user(self.company_admin)._majal_apply_role(
            self.manager_role,
            "construction",
            hr_officer,
        )
        self.assertTrue(self.field_user.has_group("hr.group_hr_user"))
        self.assertFalse(
            self.field_user.has_group("maintenance.group_equipment_manager")
        )
        self.assertFalse(
            self.field_user.has_group(
                "majal_administration.group_facilities_manager"
            )
        )

    def test_raw_capability_pack_write_is_protected(self):
        inventory = self.env.ref(
            "majal_administration.capability_inventory_user"
        )
        with self.assertRaises(AccessError):
            self.field_user.with_user(self.company_admin).write({
                "majal_capability_pack_ids": [(4, inventory.id)],
            })

    def test_invite_wizard_applies_selected_capability_pack(self):
        inventory = self.env.ref(
            "majal_administration.capability_inventory_user"
        )
        wizard = self.env["majal.user.invite.wizard"].with_user(
            self.company_admin
        ).create({
            "name": "Inventory Technician",
            "login": "inventory-technician-pack@majal.test",
            "email": "inventory-technician-pack@majal.test",
            "role_id": self.field_role.id,
            "industry_scope": "facilities",
            "capability_pack_ids": [(6, 0, inventory.ids)],
            "temporary_password": "MajalPack!2026",
        })
        action = wizard.action_create_user()
        invited = self.env["res.users"].sudo().browse(action["res_id"])
        self.assertEqual(invited.majal_capability_pack_ids, inventory)
        self.assertTrue(invited.has_group("stock.group_stock_user"))
        self.assertFalse(invited.has_group("stock.group_stock_manager"))
        wizard.flush_recordset(["temporary_password"])
        self.assertFalse(wizard.temporary_password)
