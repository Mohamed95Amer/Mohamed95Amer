import os
import re
from urllib.parse import urlparse

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


ENV_NAME_RE = re.compile(r"^MAJAL_[A-Z0-9_]+$")


class MajalIntegrationProvider(models.Model):
    """A company-owned connection definition with no secret value in SQL.

    Connector modules inherit ``_adapter_available`` and ``_deliver_job``.
    The foundation deliberately has no generic HTTP client: a URL entered by
    an administrator must never turn into an unrestricted server-side request.
    """

    _name = "majal.integration.provider"
    _description = "Majal Integration Provider"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "company_id, service, name"

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(
        required=True, index=True,
        help="Stable internal code, for example microsoft-main or portal-pf.")
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="restrict", index=True)
    service = fields.Selection(
        [
            ("microsoft", "Microsoft 365"),
            ("google", "Google Workspace"),
            ("whatsapp", "WhatsApp Business"),
            ("sms", "SMS"),
            ("maps", "Maps and Geocoding"),
            ("payment", "Payment Gateway"),
            ("storage", "Object Storage"),
            ("property_portal", "Property Portal"),
            ("monitoring", "Monitoring"),
            ("custom", "Approved Custom Connector"),
        ],
        required=True, tracking=True)
    state = fields.Selection(
        [
            ("disabled", "Disabled"),
            ("testing", "Testing"),
            ("active", "Active"),
            ("error", "Error"),
        ],
        default="disabled", required=True, tracking=True, copy=False)
    endpoint = fields.Char(
        help="HTTPS endpoint approved for this connector. The adapter must also "
             "enforce its own host allowlist.")
    secret_env_var = fields.Char(
        string="Secret Environment Variable",
        help="Name only, such as MAJAL_MICROSOFT_CLIENT_SECRET. The secret value "
             "stays in the server secret store and is never saved in Majal.")
    has_secret = fields.Boolean(compute="_compute_health")
    adapter_ready = fields.Boolean(compute="_compute_health")
    ready = fields.Boolean(compute="_compute_health")
    timeout_seconds = fields.Integer(default=15, required=True)
    max_attempts = fields.Integer(default=5, required=True)
    last_health_at = fields.Datetime(readonly=True, copy=False)
    last_success_at = fields.Datetime(readonly=True, copy=False)
    last_error = fields.Text(readonly=True, copy=False)
    notes = fields.Text()
    job_ids = fields.One2many("majal.integration.job", "provider_id")
    job_count = fields.Integer(compute="_compute_job_count")

    _sql_constraints = [
        ("code_company_unique", "unique(code, company_id)",
         "The provider code must be unique inside the company."),
        ("positive_timeout", "CHECK(timeout_seconds BETWEEN 1 AND 120)",
         "The timeout must be between 1 and 120 seconds."),
        ("valid_attempts", "CHECK(max_attempts BETWEEN 1 AND 20)",
         "Maximum attempts must be between 1 and 20."),
    ]

    @api.depends("secret_env_var", "service", "state")
    def _compute_health(self):
        for provider in self:
            provider.has_secret = bool(provider._get_secret(required=False))
            provider.adapter_ready = provider._adapter_available()
            provider.ready = bool(
                provider.adapter_ready
                and (not provider._secret_required() or provider.has_secret)
            )

    @api.depends("job_ids")
    def _compute_job_count(self):
        grouped = self.env["majal.integration.job"]._read_group(
            [("provider_id", "in", self.ids)], ["provider_id"], ["__count"])
        counts = {provider.id: count for provider, count in grouped}
        for provider in self:
            provider.job_count = counts.get(provider.id, 0)

    @api.constrains("code")
    def _check_code(self):
        for provider in self:
            if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,62}", provider.code or ""):
                raise ValidationError(
                    self.env._("Provider codes use 2-63 lowercase letters, numbers, hyphens or underscores."))

    @api.constrains("secret_env_var")
    def _check_secret_env_var(self):
        for provider in self:
            if provider.secret_env_var and not ENV_NAME_RE.fullmatch(provider.secret_env_var):
                raise ValidationError(
                    self.env._("Secret variable names must start with MAJAL_ and contain only A-Z, 0-9 and underscores."))

    @api.constrains("endpoint")
    def _check_endpoint(self):
        for provider in self:
            if not provider.endpoint:
                continue
            parsed = urlparse(provider.endpoint)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValidationError(
                    self.env._("Integration endpoints must be credential-free HTTPS URLs."))

    def _secret_required(self):
        self.ensure_one()
        return self.service not in ("monitoring",)

    def _get_secret(self, required=True):
        self.ensure_one()
        value = False
        if self.secret_env_var and ENV_NAME_RE.fullmatch(self.secret_env_var):
            value = os.environ.get(self.secret_env_var) or False
        if required and self._secret_required() and not value:
            raise UserError(
                self.env._(
                    "The server secret %(name)s is not available. Add it to the "
                    "deployment secret store; do not paste it into Majal.",
                    name=self.secret_env_var or self.env._("environment variable"),
                )
            )
        return value

    def _adapter_available(self):
        """Connector modules override this for the services they implement."""
        self.ensure_one()
        return False

    def _deliver_job(self, job):
        """Return a small result dict. Never return credentials or raw PII."""
        self.ensure_one()
        raise UserError(
            self.env._(
                "No approved adapter is installed for %(provider)s.",
                provider=self.display_name,
            )
        )

    def action_test(self):
        for provider in self:
            provider.last_health_at = fields.Datetime.now()
            if not provider._adapter_available():
                provider.write({
                    "state": "disabled",
                    "last_error": self.env._("No approved adapter is installed."),
                })
                continue
            try:
                if provider._secret_required():
                    provider._get_secret()
                provider.write({"state": "testing", "last_error": False})
            except UserError as exc:
                provider.write({"state": "error", "last_error": str(exc)})
        return True

    def action_activate(self):
        for provider in self:
            if not provider._adapter_available():
                raise UserError(
                    self.env._("Install the approved %(service)s adapter before activation.",
                               service=dict(provider._fields["service"].selection).get(provider.service)))
            if provider._secret_required():
                provider._get_secret()
            provider.write({"state": "active", "last_error": False})
        return True

    def action_disable(self):
        self.write({"state": "disabled"})
        return True

    def action_view_jobs(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Integration Jobs"),
            "res_model": "majal.integration.job",
            "view_mode": "list,form",
            "domain": [("provider_id", "=", self.id)],
            "context": {"default_provider_id": self.id},
        }
