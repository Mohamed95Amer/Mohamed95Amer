from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


ROLE_GROUPS = {
    "platform_owner": ["majal_administration.group_platform_owner"],
    "company_admin": ["majal_administration.group_user_administrator"],
    "operations_manager": [],
    "manager": [],
    "supervisor": [],
    "field_user": [],
}

CONSTRUCTION_GROUPS = {
    "platform_owner": "construction_base.group_construction_manager",
    "company_admin": "construction_base.group_construction_manager",
    "operations_manager": "construction_base.group_construction_manager",
    "manager": "construction_base.group_construction_pm",
    "supervisor": "construction_base.group_construction_site_engineer",
    "field_user": "construction_base.group_construction_user",
}

FACILITIES_GROUPS = {
    "platform_owner": "majal_administration.group_facilities_manager",
    "company_admin": "majal_administration.group_facilities_manager",
    "operations_manager": "majal_administration.group_facilities_manager",
    "manager": "majal_administration.group_facilities_manager",
    "supervisor": "majal_administration.group_facilities_supervisor",
    "field_user": "majal_administration.group_facilities_user",
}

MANAGED_GROUP_XMLIDS = set(
    [
        "majal_administration.group_platform_owner",
        "majal_administration.group_backup_operator",
        "majal_administration.group_user_administrator",
        "base.group_system",
        "base.group_erp_manager",
        "majal_administration.group_facilities_manager",
        "majal_administration.group_facilities_supervisor",
        "majal_administration.group_facilities_user",
        "maintenance.group_equipment_manager",
        "construction_base.group_construction_manager",
        "construction_base.group_construction_pm",
        "construction_base.group_construction_commercial",
        "construction_base.group_construction_site_engineer",
        "construction_base.group_construction_user",
        "project.group_project_manager",
        "project.group_project_user",
    ]
)


class ResUsers(models.Model):
    _inherit = "res.users"

    majal_role_id = fields.Many2one(
        "majal.access.role",
        string="Majal access level",
        copy=False,
    )
    majal_industry_scope = fields.Selection(
        [
            ("construction", "Construction"),
            ("facilities", "Facilities Management"),
            ("both", "Construction & Facilities"),
        ],
        string="Workspace access",
        default="both",
        required=True,
        copy=False,
    )
    majal_access_summary = fields.Char(
        string="Access summary",
        compute="_compute_majal_access_summary",
    )

    @api.depends("majal_role_id", "majal_industry_scope")
    def _compute_majal_access_summary(self):
        scope_labels = dict(self._fields["majal_industry_scope"].selection)
        for user in self:
            if not user.majal_role_id:
                user.majal_access_summary = _("Legacy / custom permissions")
            else:
                user.majal_access_summary = "%s · %s" % (
                    user.majal_role_id.name,
                    scope_labels.get(user.majal_industry_scope, ""),
                )

    def write(self, vals):
        protected = {"groups_id", "majal_role_id", "majal_industry_scope"} & set(vals)
        if (
            protected
            and not self.env.context.get("majal_role_application")
            and self.env.user.has_group(
                "majal_administration.group_user_administrator"
            )
            and not self.env.user.has_group(
                "majal_administration.group_platform_owner"
            )
        ):
            raise AccessError(
                _(
                    "Use Majal Administration to change access. Raw technical "
                    "permissions are protected."
                )
            )
        return super().write(vals)

    @api.model
    def _majal_actor_role(self):
        return self.env.user.majal_role_id

    @api.model
    def _majal_check_can_administer(self, target=None, requested_role=None):
        actor = self.env.user
        if not actor.has_group("majal_administration.group_user_administrator"):
            raise AccessError(_("You are not allowed to administer client users."))
        if actor.has_group("majal_administration.group_platform_owner"):
            return

        actor_role = actor.majal_role_id
        if not actor_role or actor_role.code != "company_admin":
            raise AccessError(_("Only a Company Administrator can manage users."))
        if requested_role and requested_role.rank >= actor_role.rank:
            raise AccessError(
                _("Company Administrators can assign Operations Manager or lower.")
            )
        if target and (
            target.has_group("majal_administration.group_platform_owner")
            or (
                target.majal_role_id
                and target.majal_role_id.rank >= actor_role.rank
            )
        ):
            raise AccessError(
                _("You cannot change an account at or above your own access level.")
            )

    @api.model
    def _majal_group_ids_for(self, role, scope):
        if not role or role.code not in ROLE_GROUPS:
            raise ValidationError(_("Select a valid Majal access level."))
        if scope not in {"construction", "facilities", "both"}:
            raise ValidationError(_("Select a valid workspace access scope."))

        xmlids = ["base.group_user", *ROLE_GROUPS[role.code]]
        if scope in {"construction", "both"}:
            xmlids.append(CONSTRUCTION_GROUPS[role.code])
            if role.code in {
                "platform_owner",
                "company_admin",
                "operations_manager",
                "manager",
            }:
                xmlids.append("project.group_project_manager")
            else:
                xmlids.append("project.group_project_user")
        if scope in {"facilities", "both"}:
            xmlids.append(FACILITIES_GROUPS[role.code])
        return {
            group.id
            for xmlid in xmlids
            if (group := self.env.ref(xmlid, raise_if_not_found=False))
        }

    def _majal_apply_role(self, role, scope):
        self.ensure_one()
        self._majal_check_can_administer(target=self, requested_role=role)
        managed_ids = {
            group.id
            for xmlid in MANAGED_GROUP_XMLIDS
            if (group := self.env.ref(xmlid, raise_if_not_found=False))
        }
        current_ids = set(self.groups_id.ids)
        desired_ids = self._majal_group_ids_for(role, scope)
        new_ids = (current_ids - managed_ids) | desired_ids
        self.sudo().with_context(majal_role_application=True).write(
            {
                "majal_role_id": role.id,
                "majal_industry_scope": scope,
                "groups_id": [(6, 0, sorted(new_ids))],
            }
        )
        self.env["majal.admin.audit"].sudo()._log(
            "access_changed",
            _("Access changed for %s to %s (%s).")
            % (self.name, role.name, scope),
            target_user=self,
        )
        return True

    def action_open_majal_access_wizard(self):
        self.ensure_one()
        self._majal_check_can_administer(target=self)
        return {
            "type": "ir.actions.act_window",
            "name": _("Change Majal Access"),
            "res_model": "majal.user.access.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_user_id": self.id},
        }

    @api.model
    def action_open_majal_invite(self, *_args):
        self._majal_check_can_administer()
        return {
            "type": "ir.actions.act_window",
            "name": _("Create Client User"),
            "res_model": "majal.user.invite.wizard",
            "view_mode": "form",
            "target": "new",
        }

    def action_majal_toggle_active(self):
        self.ensure_one()
        self._majal_check_can_administer(target=self)
        if self == self.env.user:
            raise UserError(_("You cannot deactivate your own account."))
        if self.active and self.has_group(
            "majal_administration.group_platform_owner"
        ):
            active_owners = self.search_count(
                [
                    ("active", "=", True),
                    ("majal_role_id.code", "=", "platform_owner"),
                ]
            )
            if active_owners <= 1:
                raise UserError(
                    _("Add a second Platform Owner before deactivating this account.")
                )
        new_active = not self.active
        self.sudo().write({"active": new_active})
        self.env["majal.admin.audit"].sudo()._log(
            "user_reactivated" if new_active else "user_deactivated",
            _("%s was %s.")
            % (self.name, _("reactivated") if new_active else _("deactivated")),
            target_user=self,
        )
        return {"type": "ir.actions.client", "tag": "reload"}
