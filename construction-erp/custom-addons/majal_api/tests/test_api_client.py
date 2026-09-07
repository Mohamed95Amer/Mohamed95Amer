import hashlib

from odoo.exceptions import UserError
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

    def test_portal_users_cannot_back_an_api_client(self):
        # share is computed from group membership, not writable — see
        # res.users._compute_share, which sets it purely from whether the user
        # holds base.group_user. Passing share=True on create is discarded, the
        # user is created internal by default, and the guard correctly declines
        # to fire. The fixture has to make a real portal user by giving it the
        # portal group and nothing else, or this test asserts nothing.
        portal = self.env["res.users"].sudo().create({
            "name": "Portal Integration",
            "login": "portal-integration@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [self.env.ref("base.group_portal").id])],
        })
        self.assertTrue(portal.share, "fixture is not actually a portal user")
        with self.assertRaises(UserError):
            self.env["majal.api.client"].sudo().create({
                "name": "Portal client",
                "company_id": self.env.company.id,
                "user_id": portal.id,
            })
