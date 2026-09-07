from odoo import api, fields, models


class MajalUserAccessWizard(models.TransientModel):
    _name = "majal.user.access.wizard"
    _description = "Change Majal User Access"

    user_id = fields.Many2one("res.users", required=True, readonly=True)
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

    def action_apply(self):
        self.ensure_one()
        self.user_id._majal_apply_role(
            self.role_id,
            self.industry_scope,
            self.capability_pack_ids,
        )
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
            values.setdefault(
                "capability_pack_ids",
                [(6, 0, user.majal_capability_pack_ids.ids)],
            )
        return values
