import base64

from odoo import Command
from odoo.exceptions import AccessError, ValidationError
from odoo.tests.common import TransactionCase, new_test_user


class TestMajalSignRequest(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.requester = new_test_user(
            cls.env, login="majal-sign-requester", groups="base.group_user"
        )
        cls.approver = new_test_user(
            cls.env, login="majal-sign-approver", groups="base.group_user"
        )
        cls.signer = new_test_user(
            cls.env, login="majal-sign-signer", groups="base.group_user"
        )

    def _issued_document(self):
        document = self.env["majal.document"].with_user(self.requester).create({
            "name": "Signable controlled document",
            "company_id": self.env.company.id,
            "approver_id": self.approver.id,
            "body_html": "<p>Approved content</p>",
        })
        document.with_user(self.requester).action_submit()
        document.with_user(self.approver).action_approve()
        document.with_user(self.approver).action_issue()
        return document

    def test_signing_binds_to_exact_revision_and_records_evidence(self):
        document = self._issued_document()
        request = self.env["majal.sign.request"].with_user(self.requester).create({
            "document_id": document.id,
            "version_id": document.current_version_id.id,
            "signer_id": self.signer.id,
        })
        request.with_user(self.signer).write({
            "signature": base64.b64encode(b"test-signature").decode()
        })
        request.with_user(self.signer).action_sign()
        self.assertEqual(request.state, "signed")
        self.assertEqual(request.signed_by_id, self.signer)
        self.assertEqual(len(request.signed_checksum), 64)
        with self.assertRaises(AccessError):
            request.with_user(self.signer).write({"state": "pending"})

    def test_only_named_signer_can_sign(self):
        document = self._issued_document()
        request = self.env["majal.sign.request"].with_user(self.requester).create({
            "document_id": document.id,
            "version_id": document.current_version_id.id,
            "signer_id": self.signer.id,
        })
        request.with_user(self.signer).write({
            "signature": base64.b64encode(b"test-signature").decode()
        })
        with self.assertRaises(AccessError):
            request.with_user(self.approver).action_sign()

    def test_only_named_signer_can_upload_signature(self):
        document = self._issued_document()
        request = self.env["majal.sign.request"].with_user(self.requester).create({
            "document_id": document.id,
            "version_id": document.current_version_id.id,
            "signer_id": self.signer.id,
        })
        with self.assertRaises(AccessError):
            request.with_user(self.approver).write({
                "signature": base64.b64encode(b"forged").decode()
            })

    def test_request_rejects_non_current_revision(self):
        document = self._issued_document()
        other_document = self._issued_document()
        with self.assertRaises(ValidationError):
            self.env["majal.sign.request"].with_user(self.requester).create({
                "document_id": document.id,
                "version_id": other_document.current_version_id.id,
                "signer_id": self.signer.id,
            })
