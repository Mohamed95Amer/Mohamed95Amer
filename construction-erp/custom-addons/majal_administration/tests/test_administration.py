from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import TransactionCase


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

    def test_backup_path_cannot_escape_data_volume(self):
        parameter = self.env["ir.config_parameter"].sudo()
        parameter.set_param("majal.backup_root", "/tmp/outside-majal-data")
        with self.assertRaises(ValidationError):
            self.env["majal.backup.snapshot"]._backup_root()
