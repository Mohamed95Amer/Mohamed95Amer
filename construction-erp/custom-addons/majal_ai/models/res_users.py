from odoo import api, models


class ResUsers(models.Model):
    _inherit = "res.users"

    @api.model_create_multi
    def create(self, vals_list):
        users = super().create(vals_list)
        action = self.env.ref(
            "majal_ai.action_ai_workspace", raise_if_not_found=False
        )
        if not action:
            return users
        for user, values in zip(users, vals_list):
            if (
                "action_id" not in values
                and not user.share
                and user.has_group("base.group_user")
            ):
                # ``action_id`` targets the generic ir.actions.actions model.
                # An ir.actions.client recordset is therefore not a valid
                # assignment value even though it represents the same row.
                user.sudo().action_id = action.id
        return users

    @api.model
    def action_set_majal_intelligence_home(self):
        """Make Intelligence the landing page for active internal users."""
        action = self.env.ref("majal_ai.action_ai_workspace")
        users = self.sudo().search([("active", "=", True), ("share", "=", False)])
        users.write({"action_id": action.id})
        return True
