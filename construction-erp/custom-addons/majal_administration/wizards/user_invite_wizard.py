import re

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class MajalUserInviteWizard(models.TransientModel):
    _name = "majal.user.invite.wizard"
    _description = "Create Majal Client User"

    name = fields.Char(required=True)
    login = fields.Char(string="Login email", required=True)
    email = fields.Char(required=True)
    role_id = fields.Many2one(
        "majal.access.role",
        string="Access level",
        required=True,
        domain="[('id', 'in', assignable_role_ids)]",
    )
    assignable_role_ids = fields.Many2many(
        "majal.access.role",
        compute="_compute_assignable_access",
    )
    industry_scope = fields.Selection(
        [
            ("construction", "Construction"),
            ("facilities", "Facilities Management"),
            ("both", "Construction & Facilities"),
        ],
        string="Workspace access",
        required=True,
        default="both",
    )
    capability_pack_ids = fields.Many2many(
        "majal.capability.pack",
        string="Optional capability packs",
        domain="[('id', 'in', assignable_capability_pack_ids)]",
        help="Add only the commercial capabilities this user requires.",
    )
    assignable_capability_pack_ids = fields.Many2many(
        "majal.capability.pack",
        compute="_compute_assignable_access",
    )
    temporary_password = fields.Char(
        help="Share this once through a secure channel. Majal never displays it again.",
    )

    @api.depends("role_id")
    def _compute_assignable_access(self):
        users = self.env["res.users"]
        roles = users._majal_assignable_roles()
        for wizard in self:
            wizard.assignable_role_ids = roles
            wizard.assignable_capability_pack_ids = (
                users._majal_assignable_capability_packs(wizard.role_id)
            )

    @api.onchange("role_id")
    def _onchange_role_id_capability_packs(self):
        allowed = self.env[
            "res.users"
        ]._majal_assignable_capability_packs(self.role_id)
        self.capability_pack_ids &= allowed

    def action_create_user(self):
        self.ensure_one()
        users = self.env["res.users"]
        users._majal_check_can_administer(requested_role=self.role_id)
        password = self.temporary_password or ""
        if (
            len(password) < 12
            or not re.search(r"[A-Z]", password)
            or not re.search(r"[a-z]", password)
            or not re.search(r"\d", password)
        ):
            raise ValidationError(
                _(
                    "The temporary password must be at least 12 characters and "
                    "include uppercase, lowercase and a number."
                )
            )
        login = self.login.strip().lower()
        email = self.email.strip().lower()
        if users.sudo().search_count([("login", "=", login)]):
            raise ValidationError(_("A user with this login already exists."))

        user = users.sudo().with_context(majal_role_application=True).create(
            {
                "name": self.name.strip(),
                "login": login,
                "email": email,
                "password": password,
                "company_id": self.env.company.id,
                "company_ids": [(6, 0, [self.env.company.id])],
            }
        )
        target = users.browse(user.id)
        target._majal_apply_role(
            self.role_id,
            self.industry_scope,
            self.capability_pack_ids,
        )
        self.env["majal.admin.audit"]._log(
            "user_invited",
            _("Client user %s was created.") % target.name,
            target_user=target,
            new_values={
                "login": login,
                "company_id": self.env.company.id,
                "role": self.role_id.code,
                "scope": self.industry_scope,
                "capabilities": sorted(
                    self.capability_pack_ids.mapped("code")
                ),
            },
        )
        self.write({"temporary_password": False})
        return {
            "type": "ir.actions.act_window",
            "name": _("Client User"),
            "res_model": "res.users",
            "res_id": target.id,
            "view_mode": "form",
            "views": [
                (
                    self.env.ref(
                        "majal_administration.view_majal_client_user_form"
                    ).id,
                    "form",
                )
            ],
            "target": "current",
        }
