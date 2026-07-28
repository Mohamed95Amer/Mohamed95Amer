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
