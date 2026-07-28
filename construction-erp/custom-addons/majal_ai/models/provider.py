import ipaddress
import logging
import os
from urllib.parse import urlparse

import requests
from cryptography.fernet import Fernet, InvalidToken

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError, ValidationError

_logger = logging.getLogger(__name__)


PROVIDER_SPECS = {
    "local": {
        "label": "Local AI (Free)",
        "endpoint": "http://host.docker.internal:11434/v1/chat/completions",
        "model": "qwen3:8b",
        "style": "openai",
        "requires_key": False,
    },
    "kimi": {
        "label": "Kimi",
        "endpoint": "https://api.moonshot.ai/v1/chat/completions",
        "model": "kimi-k3",
        "style": "openai",
        "requires_key": True,
    },
    "openai": {
        "label": "OpenAI",
        "endpoint": "https://api.openai.com/v1/chat/completions",
        "model": "gpt-5.6-luna",
        "style": "openai",
        "requires_key": True,
    },
    "gemini": {
        "label": "Gemini",
        "endpoint": "https://generativelanguage.googleapis.com/v1beta/models",
        "model": "gemini-3.5-flash-lite",
        "style": "gemini",
        "requires_key": True,
    },
    "anthropic": {
        "label": "Claude",
        "endpoint": "https://api.anthropic.com/v1/messages",
        "model": "claude-sonnet-5",
        "style": "anthropic",
        "requires_key": True,
    },
}


class MajalAiProvider(models.Model):
    _name = "majal.ai.provider"
    _description = "Majal AI Provider"
    _order = "sequence, id"

    name = fields.Char(required=True, translate=True)
    code = fields.Selection(
        [
            ("local", "Local AI"),
            ("kimi", "Kimi"),
            ("openai", "OpenAI"),
            ("gemini", "Gemini"),
            ("anthropic", "Claude"),
        ],
        required=True,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="cascade", index=True,
    )
    active = fields.Boolean(default=True)
    enabled = fields.Boolean(
        default=False,
        help="Makes this provider available to users in the Majal assistant.",
    )
    sequence = fields.Integer(default=10)
    endpoint = fields.Char(required=True)
    model_name = fields.Char(required=True)
    timeout_seconds = fields.Integer(default=45)
    daily_request_limit = fields.Integer(
        default=100,
        help="Maximum successful and failed requests per user per day. Set to 0 for no limit.",
    )
    monthly_token_limit = fields.Integer(
        default=500000,
        help="Maximum provider-reported tokens per company per month. Set to 0 for no limit.",
    )
    api_key_input = fields.Char(
        string="New API Key",
        compute="_compute_api_key_input",
        inverse="_inverse_api_key_input",
        groups="base.group_system",
        help="Stored encrypted using MAJAL_AI_MASTER_KEY. Existing keys are never displayed.",
    )
    api_key_encrypted = fields.Text(copy=False, groups="base.group_system")
    api_key_hint = fields.Char(compute="_compute_key_state")
    has_api_key = fields.Boolean(compute="_compute_key_state")
    is_ready = fields.Boolean(compute="_compute_key_state")
    requires_key = fields.Boolean(compute="_compute_provider_metadata")
    provider_note = fields.Char(compute="_compute_provider_metadata")

    _sql_constraints = [
        (
            "provider_company_unique",
            "unique(code, company_id)",
            "Only one configuration per provider is allowed for each company.",
        ),
    ]

    @api.depends("code")
    def _compute_provider_metadata(self):
        for provider in self:
            spec = PROVIDER_SPECS.get(provider.code, {})
            provider.requires_key = bool(spec.get("requires_key"))
            if provider.code == "local":
                provider.provider_note = _(
                    "Free local processing. Start Ollama on the Majal server or host computer."
                )
            else:
                provider.provider_note = _(
                    "Bring your own API key. Provider usage charges and terms apply."
                )

    def _compute_api_key_input(self):
        for provider in self:
            provider.api_key_input = False

    def _inverse_api_key_input(self):
        for provider in self:
            if provider.api_key_input:
                provider.api_key_encrypted = provider._encrypt_secret(
                    provider.api_key_input.strip()
                )
                # Remove the plaintext from the ORM cache immediately as well
                # as from future reads. A successful write must not leave the
                # submitted secret available to another server-side caller in
                # the same request.
                provider.api_key_input = False

    @api.depends("api_key_encrypted", "code", "endpoint", "model_name", "enabled")
    def _compute_key_state(self):
        for provider in self:
            has_key = bool(provider.api_key_encrypted)
            provider.has_api_key = has_key
            provider.api_key_hint = _("Configured") if has_key else _("Not configured")
            spec = PROVIDER_SPECS.get(provider.code, {})
            provider.is_ready = bool(
                provider.enabled
                and provider.endpoint
                and provider.model_name
                and (has_key or not spec.get("requires_key"))
            )

    @api.constrains("endpoint", "code")
    def _check_endpoint(self):
        for provider in self:
            parsed = urlparse(provider.endpoint or "")
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValidationError(_("The AI endpoint must be a valid HTTP or HTTPS URL."))
            spec = PROVIDER_SPECS.get(provider.code)
            if provider.code != "local" and spec and provider.endpoint != spec["endpoint"]:
                raise ValidationError(
                    _("Hosted provider endpoints are fixed to prevent unsafe outbound requests.")
                )
            if provider.code != "local" and parsed.scheme != "https":
                raise ValidationError(_("Hosted AI providers must use HTTPS."))
            if provider.code == "local":
                allowed_names = {"localhost", "host.docker.internal", "ollama"}
                is_private_ip = False
                try:
                    address = ipaddress.ip_address(parsed.hostname)
                    is_private_ip = (
                        address.is_private
                        or address.is_loopback
                        or address.is_link_local
                    )
                except ValueError:
                    pass
                if parsed.hostname not in allowed_names and not is_private_ip:
                    raise ValidationError(
                        _(
                            "Local AI endpoints must use localhost, "
                            "host.docker.internal, the ollama service, or a private IP."
                        )
                    )

    @api.constrains("timeout_seconds")
    def _check_timeout(self):
        for provider in self:
            if not 5 <= provider.timeout_seconds <= 120:
                raise ValidationError(_("AI timeout must be between 5 and 120 seconds."))

    @api.model
    def _master_key(self):
        value = os.environ.get("MAJAL_AI_MASTER_KEY", "").strip()
        if not value:
            raise UserError(
                _(
                    "Hosted AI keys cannot be saved until MAJAL_AI_MASTER_KEY is "
                    "configured on the Majal server."
                )
            )
        try:
            Fernet(value.encode())
        except (ValueError, TypeError) as exc:
            raise UserError(
                _("MAJAL_AI_MASTER_KEY is invalid. Generate a valid Fernet key.")
            ) from exc
        return value.encode()

    def _encrypt_secret(self, value):
        if not value:
            return False
        return Fernet(self._master_key()).encrypt(value.encode()).decode()

    def _get_api_key(self):
        self.ensure_one()
        if not self.api_key_encrypted:
            return False
        try:
            return Fernet(self._master_key()).decrypt(
                self.api_key_encrypted.encode()
            ).decode()
        except InvalidToken as exc:
            raise UserError(
                _("This provider key cannot be decrypted with the server master key.")
            ) from exc

    def action_clear_api_key(self):
        if not self.env.user.has_group("base.group_system"):
            raise AccessError(_("Only system administrators can remove provider keys."))
        self.write({"api_key_encrypted": False})
        return True

    def _sanitized(self):
        self.ensure_one()
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "model": self.model_name,
            "ready": self.is_ready,
            "enabled": self.enabled,
            "requires_key": self.requires_key,
            "has_key": self.has_api_key,
            "note": self.provider_note,
        }

    def _check_quota(self, user):
        self.ensure_one()
        usage = self.env["majal.ai.usage"].sudo()
        today = fields.Date.context_today(self)
        if self.daily_request_limit:
            used_today = usage.search_count(
                [
                    ("provider_id", "=", self.id),
                    ("user_id", "=", user.id),
                    ("request_date", "=", today),
                ]
            )
            if used_today >= self.daily_request_limit:
                raise UserError(
                    _("Your daily Majal Intelligence request limit has been reached.")
                )
        if self.monthly_token_limit:
            month_start = today.replace(day=1)
            grouped = usage.read_group(
                [
                    ("provider_id", "=", self.id),
                    ("company_id", "=", self.company_id.id),
                    ("request_date", ">=", month_start),
                ],
                ["total_tokens:sum"],
                [],
            )
            used_tokens = grouped[0]["total_tokens"] if grouped else 0
            if used_tokens >= self.monthly_token_limit:
                raise UserError(
                    _("This company has reached its monthly AI token allowance.")
                )

    def _request(self, messages, system_prompt):
        self.ensure_one()
        if not self.is_ready:
            raise UserError(
                _("The selected AI provider is not enabled or fully configured.")
            )
        api_key = self._get_api_key() if self.requires_key else False
        style = PROVIDER_SPECS[self.code]["style"]
        try:
            if style == "gemini":
                return self._request_gemini(messages, system_prompt, api_key)
            if style == "anthropic":
                return self._request_anthropic(messages, system_prompt, api_key)
            return self._request_openai(messages, system_prompt, api_key)
        except requests.Timeout as exc:
            raise UserError(
                _("The AI provider took too long to respond. Please try again.")
            ) from exc
        except requests.RequestException as exc:
            _logger.warning(
                "Majal AI provider request failed provider=%s error=%s",
                self.code,
                exc.__class__.__name__,
            )
            if self.code == "local":
                raise UserError(
                    _(
                        "Local AI is not reachable. Start Ollama and confirm that "
                        "the configured model has been downloaded."
                    )
                ) from exc
            raise UserError(
                _("The AI provider could not be reached. Check its configuration.")
            ) from exc

    def _request_openai(self, messages, system_prompt, api_key):
        payload = {
            "model": self.model_name,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
        }
        if self.code == "local":
            payload.update({"temperature": 0.2, "max_tokens": 1600})
        elif self.code == "kimi":
            payload.update({"temperature": 0.2, "max_completion_tokens": 1600})
        else:
            # Current OpenAI reasoning models use max_completion_tokens and
            # choose their own sampling behavior unless explicitly configured.
            payload["max_completion_tokens"] = 1600
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        response = requests.post(
            self.endpoint,
            json=payload,
            headers=headers,
            timeout=self.timeout_seconds,
        )
        self._raise_provider_error(response)
        data = response.json()
        content = data["choices"][0]["message"].get("content") or ""
        usage = data.get("usage") or {}
        return {
            "content": content.strip(),
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }

    def _request_gemini(self, messages, system_prompt, api_key):
        url = f"{self.endpoint}/{self.model_name}:generateContent"
        contents = []
        for message in messages:
            contents.append(
                {
                    "role": "model" if message["role"] == "assistant" else "user",
                    "parts": [{"text": message["content"]}],
                }
            )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": 1600,
            },
        }
        response = requests.post(
            url,
            params={"key": api_key},
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=self.timeout_seconds,
        )
        self._raise_provider_error(response)
        data = response.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        content = "".join(part.get("text", "") for part in parts)
        usage = data.get("usageMetadata") or {}
        return {
            "content": content.strip(),
            "input_tokens": usage.get("promptTokenCount", 0),
            "output_tokens": usage.get("candidatesTokenCount", 0),
            "total_tokens": usage.get("totalTokenCount", 0),
        }

    def _request_anthropic(self, messages, system_prompt, api_key):
        payload = {
            "model": self.model_name,
            "system": system_prompt,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 1600,
        }
        response = requests.post(
            self.endpoint,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            timeout=self.timeout_seconds,
        )
        self._raise_provider_error(response)
        data = response.json()
        content = "".join(
            part.get("text", "")
            for part in data.get("content", [])
            if part.get("type") == "text"
        )
        usage = data.get("usage") or {}
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        return {
            "content": content.strip(),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
        }

    @api.model
    def _raise_provider_error(self, response):
        if response.ok:
            return
        status = response.status_code
        if status in {401, 403}:
            raise UserError(_("The provider rejected the configured API key."))
        if status == 429:
            raise UserError(_("The provider rate limit has been reached."))
        raise UserError(
            _("The provider returned an error (HTTP %(status)s).", status=status)
        )
