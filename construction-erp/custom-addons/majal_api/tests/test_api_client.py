import hashlib

from odoo.tests.common import TransactionCase, new_test_user


class TestMajalApiClient(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.admin = new_test_user(
            cls.env,
            login="majal-api-admin",
            groups="majal_administration.group_user_administrator",
        )

    def test_rotation_only_stores_a_hash_and_authentication_is_revocable(self):
        client = self.env["majal.api.client"].sudo().create({
            "name": "Project sync",
            "company_id": self.env.company.id,
            "user_id": self.admin.id,
        })
        action = client.with_user(self.admin).action_rotate_key()
        wizard = self.env["majal.api.key.wizard"].browse(action["res_id"])
        self.assertTrue(wizard.token)
        self.assertEqual(
            client.key_hash,
            hashlib.sha256(wizard.token.encode()).hexdigest(),
        )
        self.assertNotEqual(client.key_hash, wizard.token)
        authenticated = self.env["majal.api.client"]._authenticate(wizard.token)
        self.assertEqual(authenticated, client)
        client.action_revoke()
        self.assertFalse(self.env["majal.api.client"]._authenticate(wizard.token))
