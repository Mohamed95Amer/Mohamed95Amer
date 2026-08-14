"""The write guards have to be unforgeable, not merely present.

Both guards in this module used to stand down for any truthy value under
their context key. Context travels with an RPC call, so a user with ordinary
write access could send `majal_document_transition: true` and write the
approval fields straight onto the record — forging a sign-off through the
document instead of earning it through the workflow that records who signed.

They now compare against a private object by identity. RPC carries JSON, so
the string, the number and the boolean all arrive as something that is not
that object.
"""

import base64

from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged

# The smallest thing construction_drawing's _check_pdf will accept. The
# sign-off gate refuses to submit a revision with no sheet, which is correct
# and means the happy-path test needs one.
MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"

# Everything an RPC caller could plausibly send while guessing at the guard.
FORGERIES = (True, 1, "1", "TRANSITION", "majal_document_transition",
             "majal_drawing_transition", {"": ""}, ["x"])


@tagged("post_install", "-at_install")
class TestProjectDocumentGuard(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Guarded", "is_construction": True})
        cls.user = cls.env["res.users"].create({
            "name": "Site Engineer", "login": "guard.engineer",
            "email": "guard.engineer@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("base.group_user").id,
                cls.env.ref(
                    "construction_base.group_construction_site_engineer").id,
            ])],
        })

    def _document(self):
        return self.env["majal.project.document"].create({
            "name": "Subcontract award", "project_id": self.project.id,
            "document_type": "contract",
        })

    def test_a_forged_key_does_not_change_the_state(self):
        document = self._document()
        for forged in FORGERIES:
            with self.assertRaises(AccessError, msg=repr(forged)):
                document.with_user(self.user).with_context(
                    majal_document_transition=forged
                ).write({"state": "approved"})
        document.invalidate_recordset()
        self.assertNotEqual(document.state, "approved")

    def test_a_forged_key_does_not_forge_the_approver(self):
        """Who approved it is the whole record. A field that can be written
        directly records nothing."""
        document = self._document()
        with self.assertRaises(AccessError):
            document.with_user(self.user).with_context(
                majal_document_transition=True
            ).write({"approved_by_id": self.user.id})

    def test_the_workflow_still_works(self):
        """A guard that also stops the legitimate path is not a fix."""
        document = self._document()
        document.action_submit()
        self.assertEqual(document.state, "submitted")


@tagged("post_install", "-at_install")
class TestDrawingSignOffGuard(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Guarded Drawings", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create({
            "name": "Setting Out", "number": "GD-001",
            "project_id": cls.project.id})
        cls.user = cls.env["res.users"].create({
            "name": "Drawing Engineer", "login": "guard.drawings",
            "email": "guard.drawings@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("base.group_user").id,
                cls.env.ref(
                    "construction_base.group_construction_site_engineer").id,
            ])],
        })

    def _revision(self, letter="A"):
        return self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": letter})

    def test_a_forged_key_does_not_sign_off_a_drawing(self):
        """An unsigned drawing that promotes itself to current is the site
        building to something nobody approved."""
        revision = self._revision()
        for forged in FORGERIES:
            with self.assertRaises(AccessError, msg=repr(forged)):
                revision.with_user(self.user).with_context(
                    majal_drawing_transition=forged
                ).write({"approval_state": "approved"})
        revision.invalidate_recordset()
        self.assertEqual(revision.approval_state, "draft")

    def test_a_forged_key_does_not_name_a_false_approver(self):
        revision = self._revision()
        with self.assertRaises(AccessError):
            revision.with_user(self.user).with_context(
                majal_drawing_transition=True
            ).write({"approved_by_id": self.user.id})

    def test_the_sign_off_workflow_still_works(self):
        """Submit, then sign off. A revision cannot be approved straight from
        draft, and it needs its sheet attached before it can even be
        submitted — both of which are the gate doing its job."""
        revision = self._revision()
        revision.write({
            "sheet_filename": "sheet.pdf",
            "sheet_file": base64.b64encode(MINIMAL_PDF),
        })
        revision.action_submit_approval()
        self.assertEqual(revision.approval_state, "submitted")

        revision.action_approve_revision()
        self.assertEqual(revision.approval_state, "approved")
        self.assertEqual(revision.approved_by_id, self.env.user)
