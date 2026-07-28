from odoo import fields, models


class MajalUserAccessWizard(models.TransientModel):
    _name = "majal.user.access.wizard"
    _description = "Change Majal User Access"

    user_id = fields.Many2one("res.users", required=True, readonly=True)
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
    )

    def action_apply(self):
        self.ensure_one()
        self.user_id._majal_apply_role(self.role_id, self.industry_scope)
        return {
            "type": "ir.actions.act_window",
            "name": self.user_id.name,
            "res_model": "res.users",
            "res_id": self.user_id.id,
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

    def default_get(self, field_list):
        values = super().default_get(field_list)
        user = self.env["res.users"].browse(values.get("user_id")).exists()
        if user:
            values.setdefault("role_id", user.majal_role_id.id)
            values.setdefault("industry_scope", user.majal_industry_scope)
        return values
