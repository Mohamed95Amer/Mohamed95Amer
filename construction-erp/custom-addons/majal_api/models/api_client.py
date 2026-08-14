import hashlib
import hmac
import secrets

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError


class MajalApiClient(models.Model):
    _name = "majal.api.client"
    _description = "Majal API Client"
    _inherit = ["mail.thread"]
    _order = "name, id"

    name = fields.Char(required=True, tracking=True)
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        index=True, tracking=True,
    )
    user_id = fields.Many2one(
        "res.users", required=True, tracking=True,
        domain="[('share', '=', False), ('company_ids', 'in', [company_id])]",
        help="The integration user whose groups and project rules constrain API results.",
    )
    scope = fields.Selection(
        [("projects_read", "Projects — read")],
        required=True, default="projects_read", tracking=True,
    )
    active = fields.Boolean(default=True, tracking=True)
    key_hint = fields.Char(readonly=True, copy=False)
    key_hash = fields.Char(readonly=True, copy=False)
    last_used_at = fields.Datetime(readonly=True, copy=False)
    request_count = fields.Integer(readonly=True, copy=False, default=0)

    _sql_constraints = [
        ("majal_api_client_name_company_unique", "unique(name, company_id)",
         "API client names must be unique per company."),
        ("majal_api_client_key_hash_unique", "unique(key_hash)",
         "API keys must be unique."),
    ]

    @api.constrains("user_id", "company_id")
    def _check_user_company(self):
        for client in self:
            if client.user_id and client.company_id not in client.user_id.company_ids:
                raise UserError(_("The integration user must have access to this company."))

    def action_rotate_key(self):
        self.ensure_one()
        if not self.env.user.has_group(
            "majal_administration.group_user_administrator"
        ) and not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError(_("Only a Majal administrator may rotate API keys."))
        raw_token = secrets.token_urlsafe(32)
        self.sudo().write({
            "key_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
            "key_hint": raw_token[-8:],
            "last_used_at": False,
            "request_count": 0,
        })
        wizard = self.env["majal.api.key.wizard"].create({
            "client_id": self.id,
            "token": raw_token,
        })
        return {
            "type": "ir.actions.act_window",
            "name": _("New Majal API Key"),
            "res_model": "majal.api.key.wizard",
            "res_id": wizard.id,
            "view_mode": "form",
            "target": "new",
        }

    @api.model
    def _authenticate(self, raw_token):
        if not raw_token or not isinstance(raw_token, str):
            return self.browse()
        digest = hashlib.sha256(raw_token.encode()).hexdigest()
        clients = self.sudo().search([
            ("active", "=", True),
            ("key_hash", "=", digest),
        ], limit=1)
        if not clients:
            return self.browse()
        client = clients[0]
        client.sudo().write({
            "last_used_at": fields.Datetime.now(),
            "request_count": client.request_count + 1,
        })
        return client

    def action_revoke(self):
        for client in self:
            client.sudo().write({"active": False, "key_hash": False, "key_hint": False})
        return True
