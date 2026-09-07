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
        cls.local_coder = cls.env.ref("majal_ai.provider_local_coder")
        cls.kimi = cls.env.ref("majal_ai.provider_kimi")
        cls.demo = cls.env.ref("majal_ai.provider_demo")
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
            {
                "local", "local_coder", "kimi", "openai", "gemini",
                "anthropic", "deepseek", "mistral", "groq", "demo",
            },
        )
        for provider in data["providers"]:
            self.assertNotIn("endpoint", provider)
            self.assertNotIn("api_key", provider)
            self.assertNotIn("api_key_encrypted", provider)

    def test_shipped_ollama_profiles_match_installed_models(self):
        self.assertEqual(self.local.model_name, "gpt-oss:20b")
        self.assertEqual(self.local_coder.model_name, "qwen3-coder:30b")
        self.assertFalse(self.local.requires_key)
        self.assertFalse(self.local_coder.requires_key)

    def test_local_profiles_require_explicit_runtime_opt_in(self):
        with patch.dict(os.environ, {"MAJAL_AI_LOCAL_ENABLED": ""}):
            self.local.invalidate_recordset(["is_ready"])
            self.assertFalse(self.local.is_ready)
        with patch.dict(os.environ, {"MAJAL_AI_LOCAL_ENABLED": "true"}):
            self.local.invalidate_recordset(["is_ready"])
            self.assertTrue(self.local.is_ready)

    def test_prompt_library_includes_scenarios_and_role_aware_guide(self):
        data = self.env["majal.ai.conversation"].with_user(self.user_a).bootstrap()
        scopes = {item["scope"] for item in data["suggestions"]}
        self.assertEqual(
            scopes,
            {"portfolio", "construction", "facilities", "property", "guide"},
        )
        self.assertGreaterEqual(len(data["suggestions"]), 20)
        guide = self.env["majal.ai.conversation"].with_user(self.user_a).create(
            {
                "name": "How to use Majal",
                "provider_id": self.local.id,
                "scope": "guide",
            }
        )
        context, citations = guide._build_context()
        self.assertIn("MAJAL ROLE-AWARE NAVIGATION GUIDE", context)
        self.assertIn("Majal Intelligence", context)
        self.assertIn("Property sales and operations", context)
        self.assertIn("Spreadsheets", context)
        self.assertEqual(citations, [])

    def test_internal_users_land_on_intelligence_and_explicit_home_is_kept(self):
        intelligence = self.env.ref("majal_ai.action_ai_workspace")
        user = self.env["res.users"].create(
            {
                "name": "Default Intelligence Home",
                "login": "default-intelligence-home",
                "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
            }
        )
        # Compare ids, not recordsets. res.users.action_id is a Many2one to
        # ir.actions.actions, so it reads back as ir.actions.actions(id,)
        # while env.ref gives ir.actions.client(id,). Odoo's BaseModel.__eq__
        # compares _name as well as ids, so the recordsets differ even when
        # they denote the same action.
        self.assertEqual(user.action_id.id, intelligence.id)
        explicit = self.env["res.users"].create(
            {
                "name": "Explicit Home",
                "login": "explicit-intelligence-home",
                "action_id": self.env.ref("base.action_res_users").id,
                "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
            }
        )
        self.assertEqual(
            explicit.action_id.id, self.env.ref("base.action_res_users").id)

    def test_demo_guide_is_network_free_and_only_ready_in_demo_database(self):
        self.demo.enabled = True
        parameter = self.env["ir.config_parameter"].sudo()
        parameter.set_param("majal.demo.installed", "True")
        self.demo.invalidate_recordset(["is_ready"])
        with patch(
            "odoo.addons.majal_ai.models.provider.requests.post"
        ) as request:
            result = self.demo._request(
                [{"role": "user", "content": "Show the property workflow"}],
                "system",
            )
        request.assert_not_called()
        self.assertIn("private guided mode", result["content"])

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
        # Local models are deliberately opt-in so the test must model the
        # workstation runtime explicitly rather than relying on CI/container
        # environment defaults.
        self.local.enabled = True
        with patch.dict(os.environ, {"MAJAL_AI_LOCAL_ENABLED": "true"}):
            self.local.invalidate_recordset(["is_ready"])
            self._assert_local_provider_chat_is_audited()

    def _assert_local_provider_chat_is_audited(self):
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

    def test_direct_majal_chat_uses_intelligence_history(self):
        providers = self.env["majal.ai.provider"].search(
            [("company_id", "=", self.env.company.id)]
        )
        providers.write({"enabled": False})
        self.local.enabled = True
        assistant = self.env.ref("base.partner_root")
        channel = self.env["discuss.channel"].with_user(self.user_a).channel_get(
            [assistant.id, self.user_a.partner_id.id]
        )
        conversation = self.env["majal.ai.conversation"].with_user(
            self.user_a
        ).create(
            {
                "name": "Majal chat history",
                "provider_id": self.local.id,
                "channel_id": channel.id,
            }
        )
        fake_result = {
            "conversation_id": conversation.id,
            "assistant_message": {
                "content": "**Two projects** need attention. [1]",
                "citations": [
                    {"number": 1, "label": "Tower project"},
                ],
            },
        }
        with patch.dict(os.environ, {"MAJAL_AI_LOCAL_ENABLED": "true"}):
            self.local.invalidate_recordset(["is_ready"])
            with patch(
                "odoo.addons.majal_ai.models.conversation.MajalAiConversation.ask",
                return_value=fake_result,
            ) as ask:
                answer = self.env["mail.bot"].with_user(self.user_a)._get_answer(
                    channel,
                    "<p>What needs attention?</p>",
                    {"body": "<p>What needs attention?</p>"},
                )
        self.assertIn("need attention", str(answer))
        self.assertIn("<strong>Two projects</strong>", str(answer))
        self.assertNotIn("**Two projects**", str(answer))
        self.assertIn("Tower project", str(answer))
        self.assertIn("Continue in Majal Intelligence", str(answer))
        ask.assert_called_once_with(
            "What needs attention?",
            self.local.id,
            "portfolio",
            conversation.id,
        )

    def test_direct_majal_chat_explains_when_no_provider_is_ready(self):
        self.env["majal.ai.provider"].search(
            [("company_id", "=", self.env.company.id)]
        ).write({"enabled": False})
        assistant = self.env.ref("base.partner_root")
        channel = self.env["discuss.channel"].with_user(self.user_a).channel_get(
            [assistant.id, self.user_a.partner_id.id]
        )
        answer = self.env["mail.bot"].with_user(self.user_a)._get_answer(
            channel,
            "<p>Give me a portfolio briefing</p>",
            {"body": "<p>Give me a portfolio briefing</p>"},
        )
        self.assertIn("not configured", str(answer))
        self.assertIn("Open Majal Intelligence", str(answer))
