import logging
import re

from markupsafe import Markup, escape

from odoo import _, models
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tools import html2plaintext


_logger = logging.getLogger(__name__)


class MailBot(models.AbstractModel):
    """Make Majal Chat the quick surface of Majal Intelligence.

    The full workspace remains the place for provider choice, scope filters,
    citations and conversation management. A direct message to Majal uses the
    same secured context builder, provider quota and audit trail.
    """

    _inherit = "mail.bot"

    def _get_answer(self, record, body, values, command=False):
        if (
            command
            or record._name != "discuss.channel"
            or not self._is_bot_in_private_channel(record)
        ):
            return super()._get_answer(record, body, values, command)

        question = html2plaintext(str(body or values.get("body") or "")).strip()
        if not question:
            return super()._get_answer(record, body, values, command)

        workspace_url = self._workspace_url()
        conversation = self.env["majal.ai.conversation"].search(
            [
                ("user_id", "=", self.env.user.id),
                ("company_id", "=", self.env.company.id),
                ("channel_id", "=", record.id),
                ("active", "=", True),
            ],
            limit=1,
        )
        provider = self._chat_provider(conversation)
        if not provider:
            return Markup(
                "<p><b>%s</b></p><p>%s</p><p><a href='%s'>%s</a></p>"
            ) % (
                _("Majal Intelligence is not configured yet."),
                _(
                    "Ask an Intelligence Manager to enable an AI provider. "
                    "Your message has not been sent outside Majal."
                ),
                workspace_url,
                _("Open Majal Intelligence"),
            )

        scope = conversation.scope if conversation else self._question_scope(question)
        try:
            # If a provider call fails, roll back the partial Intelligence
            # message and usage rows while keeping the original Discuss
            # message. The chat must reply with a useful recovery path rather
            # than silently swallowing the question.
            with self.env.cr.savepoint():
                result = self.env["majal.ai.conversation"].ask(
                    question,
                    provider.id,
                    scope,
                    conversation.id if conversation else False,
                )
                conversation = self.env["majal.ai.conversation"].browse(
                    result["conversation_id"]
                )
                if not conversation.channel_id:
                    conversation.channel_id = record.id
        except (AccessError, UserError, ValidationError) as error:
            _logger.info(
                "Majal Chat provider request could not be completed: %s",
                error,
            )
            return Markup(
                "<p><b>%s</b></p><p>%s</p><p><a href='%s'>%s</a></p>"
            ) % (
                _("I could not complete that Intelligence request."),
                escape(str(error)),
                workspace_url,
                _("Open Majal Intelligence to check the provider or try again"),
            )
        except Exception:
            _logger.exception("Unexpected Majal Chat Intelligence failure")
            return Markup(
                "<p><b>%s</b></p><p>%s</p><p><a href='%s'>%s</a></p>"
            ) % (
                _("I could not complete that Intelligence request."),
                _("Please try again, or open the full workspace for more detail."),
                workspace_url,
                _("Open Majal Intelligence"),
            )

        assistant = result["assistant_message"]
        answer = self._format_ai_answer(assistant["content"])
        citations = assistant.get("citations") or []
        sources = ""
        if citations:
            labels = Markup(" · ").join(
                Markup("[%s] %s") % (
                    citation.get("number", index),
                    escape(citation.get("label") or _("Majal record")),
                )
                for index, citation in enumerate(citations, start=1)
            )
            sources = Markup(
                "<p class='text-muted'><small><b>%s</b> %s</small></p>"
            ) % (_("Sources:"), labels)
        footer = Markup(
            "<p class='text-muted'><small>%s · <a href='%s'>%s</a></small></p>"
        ) % (
            _("Answered by %s", provider.name),
            workspace_url,
            _("Continue in Majal Intelligence"),
        )
        return Markup("<div>%s</div>%s%s") % (answer, sources, footer)

    def _format_ai_answer(self, content):
        """Render the small Markdown subset AI providers commonly return.

        Escaping happens before any tags are introduced, so provider output
        cannot inject HTML into Discuss.
        """
        safe = str(escape(content or ""))
        safe = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", safe)
        parts = []
        list_type = None

        def close_list():
            nonlocal list_type
            if list_type:
                parts.append(f"</{list_type}>")
                list_type = None

        for raw_line in safe.splitlines():
            line = raw_line.strip()
            if not line:
                close_list()
                continue
            numbered = re.match(r"^\d+\.\s+(.*)$", line)
            bullet = re.match(r"^[*-]\s+(.*)$", line)
            desired = "ol" if numbered else "ul" if bullet else None
            if desired:
                if list_type != desired:
                    close_list()
                    list_type = desired
                    parts.append(f"<{list_type}>")
                parts.append(f"<li>{(numbered or bullet).group(1)}</li>")
            else:
                close_list()
                parts.append(f"<p>{line}</p>")
        close_list()
        return Markup("".join(parts))

    def _workspace_url(self):
        action = self.env.ref("majal_ai.action_ai_workspace", raise_if_not_found=False)
        return f"/odoo/action-{action.id}" if action else "/odoo"

    def _chat_provider(self, conversation):
        if conversation:
            provider = conversation.sudo().provider_id
            if provider.is_ready:
                return provider

        # A user's last workspace choice is a better default than a global
        # sequence: it is how the same person expects the two surfaces to join.
        latest = self.env["majal.ai.conversation"].search(
            [
                ("user_id", "=", self.env.user.id),
                ("company_id", "=", self.env.company.id),
                ("active", "=", True),
            ],
            order="write_date desc, id desc",
            limit=10,
        )
        for item in latest:
            provider = item.sudo().provider_id
            if provider.is_ready:
                return provider

        providers = self.env["majal.ai.provider"].sudo().search(
            [
                ("company_id", "=", self.env.company.id),
                ("active", "=", True),
                ("enabled", "=", True),
            ]
        ).filtered("is_ready")
        # Local Ollama is the default private processing path. Existing chat
        # conversations keep their chosen provider above, so a company can
        # still make Gemini or another hosted provider its working default.
        rank = {
            "local": 0,
            "local_coder": 1,
            "gemini": 2,
            "kimi": 3,
            "openai": 4,
            "anthropic": 5,
        }
        return min(
            providers,
            key=lambda provider: (
                rank.get(provider.code, 99),
                provider.sequence,
                provider.id,
            ),
            default=providers,
        )

    def _question_scope(self, question):
        text = question.casefold()
        guidance = {
            "how do i", "how to", "where can i", "where is", "navigate",
            "show me the steps", "guide me", "workflow", "أين", "ازاي", "إزاي",
            "كيف", "الخطوات", "دليل", "مسار العمل",
        }
        facilities = {
            "asset", "assets", "facility", "facilities", "maintenance",
            "equipment", "work order", "nfc", "preventive", "أصل", "أصول",
            "مرفق", "مرافق", "صيانة", "معدات", "أمر عمل",
        }
        construction = {
            "project", "construction", "rfi", "submittal", "defect", "snag",
            "drawing", "boq", "site", "tender", "مشروع", "إنشاء", "موقع",
            "مناقصة", "مخطط", "عيب", "استلام",
        }
        if any(term in text for term in guidance):
            return "guide"
        if any(term in text for term in facilities):
            return "facilities"
        if any(term in text for term in construction):
            return "construction"
        return "portfolio"
