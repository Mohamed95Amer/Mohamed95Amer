import os
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet

from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMajalAi(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.local = cls.env.ref("majal_ai.provider_local")
        cls.kimi = cls.env.ref("majal_ai.provider_kimi")
        cls.user_a = cls.env["res.users"].create(
            {
                "name": "AI User A",
                "login": "majal-ai-a",
                "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
            }
        )
        cls.user_b = cls.env["res.users"].create(
            {
                "name": "AI User B",
                "login": "majal-ai-b",
                "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
            }
        )
        cls.ai_manager = cls.env["res.users"].create(
            {
                "name": "AI Manager",
                "login": "majal-ai-manager",
                "groups_id": [
                    (
                        6,
                        0,
                        [
                            cls.env.ref("base.group_user").id,
                            cls.env.ref("majal_ai.group_ai_manager").id,
                        ],
                    )
                ],
            }
        )

    def test_provider_catalog_is_sanitized(self):
        data = self.env["majal.ai.conversation"].bootstrap()
        self.assertEqual(
            {provider["code"] for provider in data["providers"]},
            {"local", "kimi", "openai", "gemini", "anthropic"},
        )
        for provider in data["providers"]:
            self.assertNotIn("endpoint", provider)
            self.assertNotIn("api_key", provider)
            self.assertNotIn("api_key_encrypted", provider)

    def test_hosted_key_is_encrypted_and_never_computed_back(self):
        master_key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"MAJAL_AI_MASTER_KEY": master_key}):
            self.kimi.write({"api_key_input": "sk-private-value"})
            self.assertTrue(self.kimi.api_key_encrypted)
            self.assertNotIn("sk-private-value", self.kimi.api_key_encrypted)
            self.assertEqual(self.kimi._get_api_key(), "sk-private-value")
            self.assertFalse(self.kimi.api_key_input)

    def test_intelligence_manager_can_configure_but_regular_users_cannot(self):
        master_key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"MAJAL_AI_MASTER_KEY": master_key}):
            self.kimi.with_user(self.ai_manager).write(
                {"api_key_input": "manager-private-value"}
            )
            self.assertTrue(self.kimi.has_api_key)
            self.kimi.with_user(self.ai_manager).action_clear_api_key()
            self.assertFalse(self.kimi.api_key_encrypted)
        with self.assertRaises(AccessError):
            self.kimi.with_user(self.user_a).write({"enabled": True})

    def test_conversations_are_private(self):
        conversation = self.env["majal.ai.conversation"].with_user(
            self.user_a
        ).create(
            {
                "name": "Private",
                "provider_id": self.local.id,
            }
        )
        self.assertEqual(
            self.env["majal.ai.conversation"].with_user(self.user_a).search_count(
                [("id", "=", conversation.id)]
            ),
            1,
        )
        self.assertEqual(
            self.env["majal.ai.conversation"].with_user(self.user_b).search_count(
                [("id", "=", conversation.id)]
            ),
            0,
        )
        with self.assertRaises(AccessError):
            conversation.with_user(self.user_b)._assert_owner()

    def test_question_length_is_limited(self):
        with self.assertRaises(ValidationError):
            self.env["majal.ai.conversation"].ask(
                "x" * 8001, self.local.id
            )

    def test_context_skips_project_fields_restricted_to_an_optional_group(self):
        project_user = self.env["res.users"].create(
            {
                "name": "AI Project User Without Project Stages",
                "login": "majal-ai-project-no-stages",
                "groups_id": [
                    (
                        6,
                        0,
                        [
                            self.env.ref("base.group_user").id,
                            self.env.ref("project.group_project_user").id,
                        ],
                    )
                ],
            }
        )
        self.assertNotIn(
            self.env.ref("project.group_project_stages"),
            project_user.groups_id,
        )
        project = self.env["project.project"].create(
            {
                "name": "Restricted Stage Project",
                "is_construction": True,
                "project_code": "AI-STAGE",
            }
        )
        summary = (
            self.env["majal.ai.conversation"]
            .with_user(project_user)
            ._record_summary(project.with_user(project_user))
        )
        self.assertIn("AI-STAGE", summary)

    def test_tls_bundle_uses_persistent_path_and_rejects_missing_configuration(self):
        provider = self.env["majal.ai.provider"]
        with patch.dict(os.environ, {"MAJAL_AI_CA_BUNDLE": ""}):
            with patch("os.path.isfile", return_value=True):
                self.assertEqual(
                    provider._tls_verify(),
                    "/var/lib/odoo/majal-ai-ca.pem",
                )
        with patch.dict(
            os.environ,
            {"MAJAL_AI_CA_BUNDLE": "/missing/majal-ca.pem"},
        ):
            with patch("os.path.isfile", return_value=False):
                with self.assertRaises(UserError):
                    provider._tls_verify()

    def test_local_provider_chat_is_audited(self):
        # Provider records are editable configuration, so this test must not
        # depend on whatever enabled state the live database currently has.
        self.local.enabled = True
        response = Mock()
        response.ok = True
        response.json.return_value = {
            "choices": [
                {"message": {"content": "Portfolio is stable. [1]"}}
            ],
            "usage": {
                "prompt_tokens": 20,
                "completion_tokens": 7,
                "total_tokens": 27,
            },
        }
        with patch(
            "odoo.addons.majal_ai.models.provider.requests.post",
            return_value=response,
        ):
            result = self.env["majal.ai.conversation"].ask(
                "Give me a portfolio briefing",
                self.local.id,
                "portfolio",
            )
        conversation = self.env["majal.ai.conversation"].browse(
            result["conversation_id"]
        )
        self.assertEqual(len(conversation.message_ids), 2)
        self.assertEqual(conversation.message_ids[-1].role, "assistant")
        usage = self.env["majal.ai.usage"].search(
            [("conversation_id", "=", conversation.id)]
        )
        self.assertEqual(usage.status, "success")
        self.assertEqual(usage.total_tokens, 27)
