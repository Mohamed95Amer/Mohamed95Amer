from odoo import Command
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase

from odoo.addons.dms.tests.common import DocumentsBaseCase


class TestMajalControlledDocuments(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        roles = cls.env["majal.access.role"]
        manager_role = roles.search([("code", "=", "manager")], limit=1)
        field_role = roles.search([("code", "=", "field_user")], limit=1)
        cls.manager = cls.env["res.users"].sudo().with_context(
            no_reset_password=True, majal_role_application=True
        ).create(
            {
                "name": "Document Manager",
                "login": "document-manager@majal.test",
                "email": "document-manager@majal.test",
                "company_id": cls.env.company.id,
                "company_ids": [Command.set([cls.env.company.id])],
                "majal_role_id": manager_role.id,
                "majal_industry_scope": "construction",
                "groups_id": [
                    Command.set(
                        cls.env["res.users"]._majal_group_ids_for(
                            manager_role, "construction"
                        )
                    )
                ],
            }
        )
        cls.field_user = cls.env["res.users"].sudo().with_context(
            no_reset_password=True, majal_role_application=True
        ).create(
            {
                "name": "Document Field User",
                "login": "document-field@majal.test",
                "email": "document-field@majal.test",
                "company_id": cls.env.company.id,
                "company_ids": [Command.set([cls.env.company.id])],
                "majal_role_id": field_role.id,
                "majal_industry_scope": "construction",
                "groups_id": [
                    Command.set(
                        cls.env["res.users"]._majal_group_ids_for(
                            field_role, "construction"
                        )
                    )
                ],
            }
        )
        cls.project = cls.env["project.project"].sudo().create(
            {
                "name": "Document Test Project",
                "is_construction": True,
                "project_code": "DOC-TEST",
                "company_id": cls.env.company.id,
                "majal_manager_id": cls.manager.id,
                "majal_member_ids": [Command.set([cls.field_user.id])],
            }
        )
        cls.template = cls.env["majal.document.template"].create(
            {
                "name": "Test Letter",
                "code": "TEST-LETTER",
                "company_id": cls.env.company.id,
                "body_html": (
                    "<p>{{ company.name }} / {{ project.name }} / "
                    "{{ document.reference }}</p>"
                ),
                "document_type": "letter",
            }
        )

    def _document(self, approver=None):
        return self.env["majal.document"].with_user(self.field_user).create(
            {
                "name": "Controlled test letter",
                "company_id": self.env.company.id,
                "project_id": self.project.id,
                "template_id": self.template.id,
                "approver_id": (approver or self.manager).id,
                "body_html": "<p>Draft</p>",
            }
        )

    def test_submit_creates_immutable_checksum_version(self):
        document = self._document()
        document.with_user(self.field_user).action_apply_template()
        document.with_user(self.field_user).action_submit()
        self.assertEqual(document.state, "submitted")
        self.assertEqual(document.version_count, 1)
        self.assertTrue(document.current_version_id.checksum)
        with self.assertRaises(AccessError):
            document.current_version_id.with_user(self.manager).write(
                {"checksum": "changed"}
            )
        with self.assertRaises(UserError):
            document.with_user(self.field_user).write({"body_html": "<p>Changed</p>"})

    def test_named_approver_and_separation_of_duties(self):
        document = self._document()
        document.with_user(self.field_user).action_submit()
        with self.assertRaises(AccessError):
            document.with_user(self.field_user).action_approve()
        document.with_user(self.manager).action_approve()
        self.assertEqual(document.approval_checksum, document.current_checksum)
        document.with_user(self.manager).action_issue()
        self.assertEqual(document.state, "issued")

    def test_submitter_cannot_name_self_as_approver(self):
        document = self._document(approver=self.field_user)
        with self.assertRaises(ValidationError):
            document.with_user(self.field_user).action_submit()

    def test_frozen_sheet_rejects_line_changes(self):
        sheet = self.env["majal.sheet"].with_user(self.manager).create(
            {
                "name": "Controlled Estimate",
                "company_id": self.env.company.id,
                "project_id": self.project.id,
                "sheet_type": "estimate",
                "line_ids": [
                    Command.create(
                        {
                            "description": "Concrete",
                            "unit": "m3",
                            "quantity": 10,
                            "unit_rate": 500,
                        }
                    )
                ],
            }
        )
        sheet.with_user(self.manager).action_freeze()
        self.assertEqual(sheet.state, "frozen")
        self.assertTrue(sheet.checksum)
        with self.assertRaises(UserError):
            sheet.line_ids.with_user(self.manager).write({"quantity": 20})
        sheet.with_user(self.manager).action_new_revision()
        sheet.line_ids.with_user(self.manager).write({"quantity": 20})
        self.assertEqual(sheet.amount_total, 10000)


class TestMajalDmsTokens(DocumentsBaseCase):
    @classmethod
    def setUpClass(cls):
        from unittest.mock import patch
        super(DocumentsBaseCase, cls).setUpClass()
        with patch.object(
            cls.env.registry["res.users"],
            "_check_password_policy",
            lambda self, passwords: None,
        ):
            cls.access_group_model = cls.env["dms.access.group"]
            cls.storage_model = cls.env["dms.storage"]
            cls.directory_model = cls.env["dms.directory"]
            cls.file_model = cls.env["dms.file"]
            cls.category_model = cls.env["dms.category"]
            cls.tag_model = cls.env["dms.tag"]
            cls.attachment_model = cls.env["ir.attachment"]
            cls.partner_model = cls.env["res.partner"]
            from odoo.tests import new_test_user

            cls.user = new_test_user(cls.env, login="basic-user")
            cls.public_user = cls.env.ref("base.public_user")
            cls.dms_user = new_test_user(
                cls.env, login="dms-user", groups="dms.group_dms_user"
            )
            cls.dms_manager_user = new_test_user(
                cls.env, login="dms-manager", groups="dms.group_dms_manager"
            )
            cls.access_group = cls.access_group_model.create(
                {
                    "name": "Test",
                    "perm_create": True,
                    "perm_write": True,
                    "perm_unlink": True,
                    "explicit_user_ids": [
                        (6, 0, [cls.dms_user.id, cls.dms_manager_user.id])
                    ],
                }
            )

    def test_directory_token_is_disabled_and_never_crosses_tree(self):
        storage = self.create_storage()
        root = self.create_directory(storage=storage)
        child = self.create_directory(storage=storage, directory=root)
        unrelated = self.create_directory(storage=storage)
        file_record = self.create_file(directory=child)
        root._portal_ensure_token()
        unrelated._portal_ensure_token()

        self.assertFalse(file_record.sudo().check_access_token(root.access_token))
        parameters = self.env["ir.config_parameter"].sudo()
        parameters.set_param("majal.documents.allow_directory_shares", "True")
        self.assertTrue(file_record.sudo().check_access_token(root.access_token))
        self.assertFalse(
            file_record.sudo().check_access_token(unrelated.access_token)
        )
