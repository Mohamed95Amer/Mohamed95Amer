import re

from odoo import _, fields, models
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
        domain="[('active', '=', True)]",
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
    temporary_password = fields.Char(
        required=True,
        help="Share this once through a secure channel. Majal never displays it again.",
    )

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

        user = users.sudo().create(
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
        target._majal_apply_role(self.role_id, self.industry_scope)
        self.env["majal.admin.audit"].sudo()._log(
            "user_invited",
            _("Client user %s was created.") % target.name,
            target_user=target,
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
