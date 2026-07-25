import hashlib
import hmac
import logging

import requests

from odoo import api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

TIMEOUT = 20


class WhatsappAccount(models.Model):
    """Credentials for one WhatsApp Business phone number.

    Odoo's own WhatsApp app is Enterprise-only, but it is itself a wrapper
    around Meta's Cloud API — which is free to use and charges per template
    message sent. This talks to that API directly, so a Community deployment
    gets the same capability without the licence.

    The access token is readable by system administrators only. It is a
    long-lived credential that can send messages billed to the company's Meta
    account, so it is not something an ordinary user has any reason to see.
    """

    _name = "whatsapp.account"
    _description = "WhatsApp Business Account"
    _order = "sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)

    phone_number_id = fields.Char(
        string="Phone Number ID", required=True,
        help="The numeric ID Meta assigns to the sending number — not the "
             "phone number itself.",
    )
    business_account_id = fields.Char(string="WhatsApp Business Account ID")
    access_token = fields.Char(
        groups="base.group_system",
        help="Permanent access token from the Meta app. Kept to system "
             "administrators because it can send messages at the company's "
             "expense.",
    )
    api_version = fields.Char(default="v21.0", required=True)
    webhook_verify_token = fields.Char(
        groups="base.group_system",
        help="Any string you choose. Meta echoes it back when verifying the "
             "webhook, which is how the callback proves it came from your "
             "own configuration.",
    )
    app_secret = fields.Char(
        groups="base.group_system",
        help="App Secret from the Meta app. Every webhook Meta sends is signed "
             "with it, and callbacks that do not carry a valid signature are "
             "refused — without it the endpoint would accept anything posted "
             "to it from anywhere.",
    )
    webhook_ready = fields.Boolean(
        compute="_compute_webhook_ready",
        help="An app secret is set, so signed callbacks can be verified.")

    state = fields.Selection(
        [("draft", "Not Verified"), ("connected", "Connected"),
         ("error", "Error")],
        default="draft", readonly=True,
    )
    last_error = fields.Char(readonly=True)
    message_count = fields.Integer(compute="_compute_message_count")

    _sql_constraints = [
        ("phone_number_id_uniq", "unique(phone_number_id, company_id)",
         "That phone number ID is already configured for this company."),
    ]

    def _compute_webhook_ready(self):
        for account in self:
            account.webhook_ready = bool(account.sudo().app_secret)

    @api.model
    def _verify_signature(self, header, body):
        """Is this callback really from Meta?

        Meta signs every webhook with HMAC-SHA256 of the raw request body under
        the app secret. Verifying it is the only thing standing between a public
        endpoint and anyone on the internet marking messages as delivered or
        posting text into a project's chatter.

        This fails closed. If no account has an app secret configured, no
        callback is accepted — refusing delivery receipts is a smaller problem
        than accepting forged ones.
        """
        if not header or not header.startswith("sha256="):
            return False
        provided = header.split("=", 1)[1]
        for secret in self.sudo().search([]).mapped("app_secret"):
            if not secret:
                continue
            expected = hmac.new(
                secret.encode(), body, hashlib.sha256).hexdigest()
            if hmac.compare_digest(provided, expected):
                return True
        return False

    def _compute_message_count(self):
        counts = dict(self.env["whatsapp.message"]._read_group(
            [("account_id", "in", self.ids)], ["account_id"], ["__count"]))
        for account in self:
            account.message_count = counts.get(account, 0)

    @api.model
    def _default_account(self, company=None):
        """The account messages are sent from when nothing else is specified."""
        company = company or self.env.company
        return self.search(
            [("company_id", "in", [company.id, False])], limit=1)

    def _endpoint(self, path):
        self.ensure_one()
        return f"https://graph.facebook.com/{self.api_version}/{path}"

    def _perform_request(self, path, payload):
        """The single place this module reaches the network.

        Kept as one small method on purpose: it is the seam the tests replace,
        so the whole send path can be exercised without a Meta account and
        without a test suite that quietly depends on the internet.
        """
        self.ensure_one()
        token = self.sudo().access_token
        if not token:
            raise UserError(self.env._(
                "No access token on WhatsApp account %s.", self.name))
        response = requests.post(
            self._endpoint(path),
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        if response.status_code >= 400:
            raise UserError(self.env._(
                "WhatsApp refused the message (%(code)s): %(body)s",
                code=response.status_code, body=response.text[:500],
            ))
        return response.json()

    def action_test_connection(self):
        """Send nothing — just prove the credentials and number are live."""
        self.ensure_one()
        try:
            token = self.sudo().access_token
            if not token:
                raise UserError(self.env._("Set an access token first."))
            response = requests.get(
                self._endpoint(self.phone_number_id),
                headers={"Authorization": f"Bearer {token}"},
                timeout=TIMEOUT,
            )
            if response.status_code >= 400:
                raise UserError(response.text[:500])
        except UserError as err:
            self.write({"state": "error", "last_error": str(err)})
            raise
        except Exception as err:  # network, DNS, TLS
            self.write({"state": "error", "last_error": str(err)})
            raise UserError(self.env._("Could not reach WhatsApp: %s", err)) from err
        self.write({"state": "connected", "last_error": False})
        return True

    def action_view_messages(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("WhatsApp Messages"),
            "res_model": "whatsapp.message",
            "view_mode": "list,form",
            "domain": [("account_id", "=", self.id)],
        }
