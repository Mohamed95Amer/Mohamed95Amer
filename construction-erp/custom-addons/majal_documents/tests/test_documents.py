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
        import contextlib
        from unittest.mock import patch
        super(DocumentsBaseCase, cls).setUpClass()

        # _check_password_policy comes from auth_password_policy, which is
        # pulled in by other modules rather than by this one. Patching it
        # unconditionally made this class pass or fail depending on what else
        # happened to be installed: green under run-tests.sh all, an
        # AttributeError in setUpClass when majal_documents is run on its own.
        # A test whose result depends on its neighbours is not testing this
        # module.
        users = cls.env.registry["res.users"]
        relax_password_policy = contextlib.nullcontext()
        if hasattr(users, "_check_password_policy"):
            relax_password_policy = patch.object(
                users, "_check_password_policy", lambda self, passwords: None,
            )

        with relax_password_policy:
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


class TestForgedTransitionContext(TestMajalControlledDocuments):
    """The guard has to be unforgeable, not merely present.

    Both write guards used to stand down for any truthy value under their
    context key. Context travels with an RPC call, so a user holding ordinary
    write access could send `majal_document_transition: true` and write the
    approval fields directly — forging a signature trail through the document
    rather than through the workflow that records who signed it.

    RPC carries JSON, so a caller can send the string, the number or the
    boolean, and none of them *are* the private object the guard now compares
    against by identity.
    """

    FORGERIES = (True, 1, "1", "DOCUMENT_TRANSITION", "majal_document_transition",
                 {"": ""}, ["x"])

    def _sheet(self):
        return self.env["majal.sheet"].with_user(self.manager).create({
            "name": "Forgery Estimate",
            "company_id": self.env.company.id,
            "project_id": self.project.id,
            "sheet_type": "estimate",
            "line_ids": [Command.create({
                "description": "Concrete", "unit": "m3",
                "quantity": 10, "unit_rate": 500,
            })],
        })

    def test_a_forged_document_key_does_not_unlock_the_state(self):
        document = self._document()
        for forged in self.FORGERIES:
            with self.assertRaises(AccessError, msg=repr(forged)):
                document.with_user(self.field_user).with_context(
                    majal_document_transition=forged
                ).write({"state": "approved"})
        self.assertEqual(document.state, "draft")

    def test_a_forged_document_key_does_not_forge_a_signature(self):
        """The fields that say who approved it are the point of the guard."""
        document = self._document()
        for field, value in (("approved_by_id", self.field_user.id),
                             ("approval_checksum", "deadbeef"),
                             ("issued_by_id", self.field_user.id)):
            with self.assertRaises(AccessError, msg=field):
                document.with_user(self.field_user).with_context(
                    majal_document_transition=True
                ).write({field: value})

    def test_a_forged_sheet_key_does_not_unfreeze_it(self):
        sheet = self._sheet()
        sheet.with_user(self.manager).action_freeze()
        for forged in self.FORGERIES:
            with self.assertRaises(AccessError, msg=repr(forged)):
                sheet.with_user(self.manager).with_context(
                    majal_sheet_transition=forged
                ).write({"state": "draft"})
        self.assertEqual(sheet.state, "frozen")

    def test_a_forged_sheet_key_does_not_rewrite_the_checksum(self):
        """A sheet whose checksum can be rewritten is not evidence of
        anything."""
        sheet = self._sheet()
        sheet.with_user(self.manager).action_freeze()
        original = sheet.checksum
        with self.assertRaises(AccessError):
            sheet.with_user(self.manager).with_context(
                majal_sheet_transition=True
            ).write({"checksum": "0" * 64})
        self.assertEqual(sheet.checksum, original)

    def test_the_document_workflow_itself_still_works(self):
        """Closing a hole that also closes the door is not a fix."""
        document = self._document()
        document.with_user(self.field_user).action_submit()
        self.assertEqual(document.state, "submitted")
        document.with_user(self.manager).action_approve()
        self.assertEqual(document.state, "approved")
        self.assertEqual(document.approved_by_id, self.manager)

    def test_the_sheet_workflow_itself_still_works(self):
        sheet = self._sheet()
        sheet.with_user(self.manager).action_freeze()
        self.assertEqual(sheet.state, "frozen")
        self.assertTrue(sheet.checksum)
        sheet.with_user(self.manager).action_new_revision()
        self.assertEqual(sheet.state, "draft")
