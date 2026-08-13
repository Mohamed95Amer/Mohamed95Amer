import importlib.util
import tempfile
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import odoo

from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import HttpCase, TransactionCase, tagged


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

    def test_personal_todo_is_private_and_not_blocked_by_project_tenant_rule(self):
        self.env["res.users"]._majal_install_tenant_rules()
        personal = self.env["project.task"].with_user(self.company_admin).create(
            {
                "name": "Prepare my weekly follow-up",
                "project_id": False,
                "user_ids": [(6, 0, [self.company_admin.id])],
            }
        )
        self.assertEqual(personal.project_id, self.env["project.project"])
        self.assertEqual(personal.user_ids, self.company_admin)
        self.assertEqual(
            personal.with_user(self.field_user).search_count(
                [("id", "=", personal.id)]
            ),
            0,
        )

    def test_platform_roles_include_project_stage_field_access(self):
        stages = self.env.ref("project.group_project_stages")
        for role in (self.owner_role, self.admin_role, self.operations_role, self.manager_role):
            self.assertIn(stages, role.construction_group_ids)

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


class TestMajalAccessLevels(TransactionCase):
    """A level is a permission grant a company is allowed to edit.

    Which makes it the most dangerous editable record in the system: whoever
    can put a group into a level can give that group to themselves. These
    tests are mostly about what an administrator is stopped from doing.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.field_role = cls.env.ref("majal_administration.role_field_user")
        cls.admin_role = cls.env.ref("majal_administration.role_company_admin")
        cls.owner_role = cls.env.ref("majal_administration.role_platform_owner")
        cls.users = cls.env["res.users"].with_context(no_reset_password=True)

        cls.company_admin = cls.users.create({
            "name": "Levels Admin",
            "login": "levels-admin@majal.local",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
        })
        cls.company_admin._majal_apply_role(cls.admin_role, "both")
        cls.field_user = cls.users.create({
            "name": "Levels Field User",
            "login": "levels-field@majal.local",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
        })
        cls.field_user._majal_apply_role(cls.field_role, "construction")

    def _own_copy(self, role=None):
        role = role or self.field_role
        copy_action = role.with_user(
            self.company_admin).action_majal_customise_for_company()
        return self.env["majal.access.role"].browse(copy_action["res_id"])

    def test_the_standard_levels_ship_with_the_permissions_they_grant(self):
        """The mapping used to live in Python; if it is empty here, an
        upgraded database hands every user a bare login and nothing else."""
        self.assertIn(
            self.env.ref("majal_administration.group_platform_owner"),
            self.owner_role.group_ids,
        )
        self.assertIn(
            self.env.ref("construction_base.group_construction_user"),
            self.field_role.construction_group_ids,
        )
        self.assertIn(
            self.env.ref("majal_administration.group_facilities_user"),
            self.field_role.facility_group_ids,
        )

    def test_a_standard_level_cannot_be_edited_by_a_company(self):
        with self.assertRaises(AccessError):
            self.field_role.with_user(self.company_admin).write(
                {"name": "Level 1"})

    def test_a_company_can_rename_its_own_copy(self):
        own = self._own_copy()
        own.with_user(self.company_admin).write({"name": "Level 1 — Labourer"})
        self.assertEqual(own.name, "Level 1 — Labourer")
        # The standard level is untouched, so another company still sees it.
        self.assertEqual(self.field_role.name, "Field User / Technician")

    def test_customising_twice_reuses_the_same_copy(self):
        first = self._own_copy()
        second = self._own_copy()
        self.assertEqual(first, second)

    def test_a_company_copy_is_what_its_own_users_are_given(self):
        own = self._own_copy()
        planning = self.env.ref("construction_base.group_construction_pm")
        own.sudo().write({"construction_group_ids": [(4, planning.id)]})
        self.field_user.with_user(self.company_admin)._majal_apply_role(
            self.field_role, "construction")
        self.assertTrue(self.field_user.has_group(
            "construction_base.group_construction_pm"))

    def test_changing_a_level_updates_the_people_already_on_it(self):
        """Otherwise a company edits a level, sees no change, and concludes
        the permission never applied."""
        own = self._own_copy()
        planning = self.env.ref("construction_base.group_construction_pm")
        self.assertFalse(self.field_user.has_group(
            "construction_base.group_construction_pm"))
        own.sudo().write({"construction_group_ids": [(4, planning.id)]})
        self.assertTrue(self.field_user.has_group(
            "construction_base.group_construction_pm"))

    def test_a_level_cannot_be_used_to_grant_administration(self):
        own = self._own_copy()
        owner_group = self.env.ref(
            "majal_administration.group_platform_owner")
        with self.assertRaises(AccessError):
            own.with_user(self.company_admin).write(
                {"group_ids": [(4, owner_group.id)]})

    def test_a_level_cannot_grant_a_permission_the_editor_lacks(self):
        """The whole guard in one sentence: you cannot hand out what you do
        not have. Without it, a Company Administrator writes Technical
        Settings into a level, assigns themselves that level, and is now the
        system administrator."""
        own = self._own_copy()
        payroll = self.env.ref("hr.group_hr_manager")
        self.assertNotIn(payroll, self.company_admin.groups_id)
        with self.assertRaises(AccessError):
            own.with_user(self.company_admin).write(
                {"group_ids": [(4, payroll.id)]})

    def test_a_company_cannot_edit_another_companys_level(self):
        other = self.env["res.company"].create({"name": "Other Contractor"})
        theirs = self.field_role.sudo().copy({
            "company_id": other.id, "name": "Their Level 1"})
        with self.assertRaises(AccessError):
            theirs.with_user(self.company_admin).write({"name": "Mine now"})

    def test_a_level_at_or_above_the_editors_own_is_refused(self):
        own_admin_level = self._own_copy(self.admin_role)
        with self.assertRaises(AccessError):
            own_admin_level.with_user(self.company_admin).write(
                {"name": "Level 6"})

    def test_only_one_standard_level_per_code(self):
        with self.assertRaises(ValidationError):
            self.env["majal.access.role"].sudo().create({
                "name": "Duplicate field user",
                "code": "field_user",
                "rank": 10,
            })

    def test_a_company_is_offered_its_own_level_and_not_the_standard(self):
        own = self._own_copy()
        offered = self.env["res.users"].with_user(
            self.company_admin)._majal_assignable_roles()
        codes = offered.filtered(lambda r: r.code == "field_user")
        self.assertEqual(codes, own)


@tagged("post_install", "-at_install")
class TestMajalHealth(HttpCase):
    """The infrastructure side points Caddy and monitoring at these.

    Four callers matter and are all covered below: nobody, an ordinary
    internal user, an authorised monitoring account, and an administrator.
    """

    # Anything that would tell a reader where this runs, what it runs on, or
    # what it is made of. Asserted against response bodies rather than eyeballed,
    # so a future field that leaks one of these fails the suite.
    FORBIDDEN = (
        "odoo", "postgres", "psql", "traceback", "ghcr", "sha256",
        "/srv", "/var", "/etc", "/mnt", "container", "docker", "caddy",
        "password", "secret", "token", "api_key", "hetzner", "cloudflare",
        "exception", "file \"", "line ", "localhost", "127.0.0.1",
    )

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        users = cls.env["res.users"].with_context(no_reset_password=True)
        cls.plain_user = users.create({
            "name": "Ordinary Internal User",
            "login": "health-ordinary@majal.test",
            "password": "health-ordinary-pw-2026",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
        })
        cls.monitor = users.create({
            "name": "Monitoring Agent",
            "login": "health-monitor@majal.test",
            "password": "health-monitor-pw-2026",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref(
                "majal_administration.group_platform_monitor").id])],
        })

    def _assert_discloses_nothing(self, response):
        body = response.text.lower()
        for token in self.FORBIDDEN:
            self.assertNotIn(token, body)
        self.assertNotIn(self.env.cr.dbname.lower(), body)

    # ---- the public probe -------------------------------------------------

    def test_shallow_probe_answers_ok_and_says_nothing_else(self):
        response = self.url_open("/majal/health", timeout=15)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        # The whole body, not just the presence of "ok". A later addition of a
        # version or a database name should fail here rather than ship.
        self.assertEqual(response.json(), {"status": "ok"})
        self._assert_discloses_nothing(response)

    def test_shallow_probe_needs_no_session(self):
        response = self.url_open("/majal/health", timeout=15)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Set-Cookie", response.headers)

    def test_shallow_probe_is_rate_limited(self):
        from odoo.addons.majal_administration.controllers import health

        health._hits.clear()
        seen = set()
        for _ in range(health.RATE_LIMIT + 5):
            seen.add(self.url_open("/majal/health", timeout=15).status_code)

        self.assertIn(429, seen)
        health._hits.clear()

    def test_rate_limiter_storage_is_bounded(self):
        from odoo.addons.majal_administration.controllers import health

        health._hits.clear()
        health._hits["a-caller-that-went-away"] = [0.0]
        # A caller whose window has expired is dropped rather than kept
        # forever, so the map cannot grow without bound across a long uptime.
        self.assertFalse(health._rate_limited("a-caller-that-went-away"))
        self.assertEqual(list(health._hits), ["a-caller-that-went-away"])
        self.assertEqual(len(health._hits["a-caller-that-went-away"]), 1)
        health._hits.clear()

    # ---- the deep probe, by caller ---------------------------------------

    def test_deep_probe_refuses_an_unauthenticated_caller(self):
        response = self.url_open("/majal/health/deep", timeout=15,
                                 allow_redirects=False)
        self.assertNotEqual(response.status_code, 200)
        self.assertNotIn("checks", response.text)

    def test_deep_probe_refuses_an_ordinary_internal_user(self):
        # Having a login is not a reason to be handed a map of where the
        # platform is weak.
        self.authenticate("health-ordinary@majal.test", "health-ordinary-pw-2026")
        response = self.url_open("/majal/health/deep", timeout=15)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"status": "forbidden"})
        # And no hint about which group would have worked.
        self.assertNotIn("group", response.text.lower())

    def test_deep_probe_answers_an_authorised_monitor(self):
        self.authenticate("health-monitor@majal.test", "health-monitor-pw-2026")
        response = self.url_open("/majal/health/deep", timeout=15)

        payload = response.json()
        self.assertEqual(set(payload), {"status", "checks"})
        self.assertEqual(set(payload["checks"]),
                         {"modules", "scheduler", "recovery_points"})
        self.assertIn(payload["status"], {"ok", "degraded"})
        self._assert_discloses_nothing(response)

    def test_deep_probe_answers_an_administrator(self):
        # Platform Owner reaches it by implication, not by a second grant.
        self.authenticate("admin", "admin")
        response = self.url_open("/majal/health/deep", timeout=15)

        self.assertEqual(set(response.json()), {"status", "checks"})
        self._assert_discloses_nothing(response)

    def test_monitor_group_grants_nothing_but_the_probe(self):
        # The point of a dedicated group: these credentials end up in a
        # monitoring config file, so they must be worth as little as possible.
        self.assertFalse(self.monitor.has_group(
            "majal_administration.group_user_administrator"))
        self.assertFalse(self.monitor.has_group(
            "majal_administration.group_backup_operator"))
        self.assertFalse(self.monitor.has_group(
            "majal_administration.group_platform_owner"))
        self.assertFalse(self.monitor.has_group("base.group_system"))

    def test_degraded_checks_answer_503(self):
        # A monitor should not have to parse the body to know something is
        # wrong; the status code carries it.
        #
        # The stand-in goes on the module function rather than on the route
        # method: the router binds a route's function object once at
        # registration, so patching MajalHealth.deep changes an attribute
        # nothing subsequently reads. The first version of this test did
        # exactly that and passed nothing through.
        from odoo.addons.majal_administration.controllers import health

        self.authenticate("health-monitor@majal.test", "health-monitor-pw-2026")
        with patch.object(
            health, "_gather_checks",
            return_value=(False, {"modules": "pending",
                                  "scheduler": "current",
                                  "recovery_points": "verified"}),
        ):
            response = self.url_open("/majal/health/deep", timeout=15)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "degraded")
        self._assert_discloses_nothing(response)
