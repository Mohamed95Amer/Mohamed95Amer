from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError

# Which suites a scope opens. Named sets rather than literals repeated at
# three call sites, because the next suite to join the platform should be one
# entry here and not a hunt through the file.
FACILITY_SCOPES = {"facilities", "both", "property_facilities"}
PROPERTY_SCOPES = {"real_estate", "property_facilities"}
CONSTRUCTION_SCOPES = {"construction", "both"}
MAJAL_SCOPES = FACILITY_SCOPES | PROPERTY_SCOPES | CONSTRUCTION_SCOPES


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
        "purchase.group_purchase_manager",
        "purchase.group_purchase_user",
        "stock.group_stock_manager",
        "stock.group_stock_user",
        "account.group_account_readonly",
        "account.group_account_user",
        "account.group_account_manager",
        "hr.group_hr_user",
        "hr.group_hr_manager",
        "website.group_website_restricted_editor",
        "website.group_website_designer",
        "majal_ai.group_ai_manager",
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
            ("real_estate", "Property"),
            ("property_facilities", "Property & Facilities"),
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
    majal_capability_pack_ids = fields.Many2many(
        "majal.capability.pack",
        "res_users_majal_capability_pack_rel",
        "user_id",
        "pack_id",
        string="Optional capability packs",
        copy=False,
    )

    @api.depends(
        "majal_role_id",
        "majal_industry_scope",
        "majal_capability_pack_ids",
        "majal_capability_pack_ids.name",
    )
    def _compute_majal_access_summary(self):
        scope_labels = dict(self._fields["majal_industry_scope"].selection)
        for user in self:
            if not user.majal_role_id:
                user.majal_access_summary = _("Legacy / custom permissions")
                continue
            parts = [
                user.majal_role_id.name,
                scope_labels.get(user.majal_industry_scope, ""),
            ]
            if user.majal_capability_pack_ids:
                ordered = user.majal_capability_pack_ids.sorted(
                    key=lambda pack: (pack.family, pack.tier_rank)
                )
                parts.append(
                    _("Capabilities: %s")
                    % ", ".join(ordered.mapped("name"))
                )
            user.majal_access_summary = " • ".join(parts)

    def write(self, vals):
        protected = {
            "groups_id",
            "majal_role_id",
            "majal_industry_scope",
            "majal_capability_pack_ids",
        } & set(vals)
        if (
            protected
            # Elevation, not a context key. This guard used to stand down
            # when `majal_role_application` was in the context — and context is
            # supplied by the caller, so whoever was being guarded could simply
            # ask for the exemption over RPC and write groups_id directly,
            # which is the exact thing the guard exists to stop. `env.su`
            # cannot be asked for from outside: it is only true where
            # server-side code has called sudo(), which is what the sanctioned
            # paths do.
            and not self.env.su
        ):
            raise AccessError(
                _(
                    "Use Majal Administration to change access. Raw technical "
                    "permissions are protected."
                )
            )
        self._majal_check_last_owner_change(vals)
        return super().write(vals)

    def unlink(self):
        owner_group = self.env.ref(
            "majal_administration.group_platform_owner",
            raise_if_not_found=False,
        )
        current_owners = self.filtered(
            lambda user: owner_group
            and user.active
            and owner_group in user.groups_id
        )
        if current_owners:
            active_owners = self.search_count(
                [("active", "=", True), ("groups_id", "in", owner_group.id)]
            )
            if active_owners - len(current_owners) < 1:
                raise UserError(
                    _("Add a second Platform Owner before deleting this account.")
                )
        return super().unlink()

    @api.model
    def _majal_group_ids_after_commands(self, current_ids, commands):
        result = set(current_ids)
        for command in commands or []:
            operation = command[0]
            if operation == 3:
                result.discard(command[1])
            elif operation == 4:
                result.add(command[1])
            elif operation == 5:
                result.clear()
            elif operation == 6:
                result = set(command[2])
        return result

    def _majal_check_last_owner_change(self, vals):
        """Keep one active owner regardless of which API performs the write."""
        owner_group = self.env.ref(
            "majal_administration.group_platform_owner",
            raise_if_not_found=False,
        )
        if not owner_group:
            return
        current_owners = self.filtered(
            lambda user: user.active and owner_group in user.groups_id
        )
        if not current_owners:
            return
        role = False
        if vals.get("majal_role_id"):
            role = self.env["majal.access.role"].browse(vals["majal_role_id"])
        losing = self.env["res.users"]
        for user in current_owners:
            remains_active = vals.get("active", user.active)
            remains_owner = True
            if "majal_role_id" in vals:
                remains_owner = bool(role and role.code == "platform_owner")
            if "groups_id" in vals:
                groups_after = self._majal_group_ids_after_commands(
                    user.groups_id.ids, vals["groups_id"]
                )
                remains_owner = remains_owner and owner_group.id in groups_after
            if not remains_active or not remains_owner:
                losing |= user
        if losing:
            active_owners = self.search_count(
                [("active", "=", True), ("groups_id", "in", owner_group.id)]
            )
            if active_owners - len(losing) < 1:
                raise UserError(
                    _("Add a second Platform Owner before removing this owner's access.")
                )

    @api.model
    def _majal_actor_role(self):
        return self.env.user.majal_role_id

    @api.model
    def _majal_assignable_roles(self):
        """Return only the roles the current administrator may grant."""
        company = self.env.company
        roles = self.env["majal.access.role"].search(
            [
                ("active", "=", True),
                "|",
                ("company_id", "=", False),
                ("company_id", "=", company.id),
            ],
            order="rank desc, name, id",
        )
        # One row per level: a company that has customised a level should be
        # offered its own version, not both and not somebody else's.
        customised = set(roles.filtered("company_id").mapped("code"))
        roles = roles.filtered(
            lambda role: role.company_id or role.code not in customised)
        actor = self.env.user
        if actor.has_group("majal_administration.group_platform_owner"):
            return roles
        actor_role = actor.majal_role_id
        if (
            actor.has_group(
                "majal_administration.group_user_administrator"
            )
            and actor_role
            and actor_role.code == "company_admin"
        ):
            return roles.filtered(lambda role: role.rank < actor_role.rank)
        return roles.browse()

    @api.model
    def _majal_assignable_capability_packs(self, role):
        """Return the active capability tiers grantable for ``role``."""
        if not role:
            return self.env["majal.capability.pack"]
        packs = self.env["majal.capability.pack"].search(
            [
                ("active", "=", True),
                ("minimum_role_rank", "<=", role.rank),
            ],
            order="sequence, family, tier_rank, id",
        )
        if not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            packs = packs.filtered(lambda pack: not pack.platform_owner_only)
        return packs

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
        if target and target.company_id != actor.company_id:
            raise AccessError(
                _("Company Administrators can only manage users in their current company.")
            )
        if target and set(target.company_ids.ids) - set(actor.company_ids.ids):
            raise AccessError(
                _("You cannot manage a user who belongs to another company.")
            )
        if requested_role and requested_role.rank >= actor_role.rank:
            raise AccessError(
                _("Company Administrators can assign Operations Manager or lower.")
            )
        if target and (
            target.has_group("majal_administration.group_platform_owner")
            # A technical administrator outranks every Majal role, and until
            # now outranked none of them: an account holding base.group_system
            # with no majal_role_id passed both tests below — the first because
            # it is not a platform owner, the second because it has no role to
            # compare. A Company Administrator could then apply a role to it,
            # and _majal_apply_role strips base.group_system and
            # base.group_erp_manager on the way through. That is a demotion of
            # the person who administers the system, performed by somebody who
            # is not allowed to administer them.
            or target.has_group("base.group_system")
            or target.has_group("base.group_erp_manager")
            or (
                target.majal_role_id
                and target.majal_role_id.rank >= actor_role.rank
            )
        ):
            raise AccessError(
                _("You cannot change an account at or above your own access level.")
            )

    @api.model
    def _majal_capability_records(self, capability_packs):
        if not capability_packs:
            return self.env["majal.capability.pack"]
        if hasattr(capability_packs, "ids"):
            return self.env["majal.capability.pack"].browse(
                capability_packs.ids
            )
        return self.env["majal.capability.pack"].browse(capability_packs)

    @api.model
    def _majal_validate_capability_packs(self, role, capability_packs):
        packs = self._majal_capability_records(capability_packs)
        families = packs.mapped("family")
        if len(families) != len(set(families)):
            raise ValidationError(
                _("Select only one access tier from each capability family.")
            )
        inactive = packs.filtered(lambda pack: not pack.active)
        if inactive:
            raise ValidationError(
                _("Inactive capability packs cannot be assigned: %s")
                % ", ".join(inactive.mapped("name"))
            )
        insufficient = packs.filtered(
            lambda pack: role.rank < pack.minimum_role_rank
        )
        if insufficient:
            raise ValidationError(
                _(
                    "%(role)s cannot receive these capability packs: %(packs)s.",
                    role=role.name,
                    packs=", ".join(insufficient.mapped("name")),
                )
            )
        owner_only = packs.filtered("platform_owner_only")
        if owner_only and not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError(
                _("Platform Owner approval is required for: %s")
                % ", ".join(owner_only.mapped("name"))
            )
        return packs

    @api.model
    def _majal_group_ids_for(self, role, scope, capability_packs=None,
                             company=None):
        if not role:
            raise ValidationError(_("Select a valid Majal access level."))
        if scope not in MAJAL_SCOPES:
            raise ValidationError(_("Select a valid workspace access scope."))

        # What a level grants is data a company can edit, so resolve to the
        # copy that applies here rather than reading the record handed in: a
        # user may still point at the standard level after their company has
        # customised it.
        level = role._majal_effective_for(company or self.env.company)
        base_user = self.env.ref("base.group_user", raise_if_not_found=False)
        groups = level.group_ids
        if scope in {"construction", "both"}:
            groups |= level.construction_group_ids
        if scope in FACILITY_SCOPES:
            groups |= level.facility_group_ids
        if scope in PROPERTY_SCOPES:
            groups |= level.real_estate_group_ids
        group_ids = set(groups.ids)
        if base_user:
            # Never level-editable: an internal user who is not an internal
            # user cannot log in to anything.
            group_ids.add(base_user.id)
        packs = self._majal_capability_records(capability_packs)
        group_ids.update(packs.mapped("group_ids").ids)
        return group_ids

    def _majal_reapply_current_access(self):
        """Recompute this user's groups from the level they already hold.

        Called when a level's contents change. Deliberately not routed through
        `_majal_apply_role`: nobody is being granted a new level here, so the
        actor checks there would either block a legitimate system recompute or
        have to be waived — and waiving them is how that guard gets lost.
        """
        for user in self:
            if not user.majal_role_id:
                continue
            desired = self._majal_group_ids_for(
                user.majal_role_id,
                user.majal_industry_scope,
                user.majal_capability_pack_ids,
                company=user.company_id,
            )
            if set(user.groups_id.ids) == desired:
                continue
            user.sudo().write({"groups_id": [(6, 0, sorted(desired))]})
        return True

    def _majal_apply_role(self, role, scope, capability_packs=None):
        self.ensure_one()
        self._majal_check_can_administer(target=self, requested_role=role)
        packs = (
            self.majal_capability_pack_ids
            if capability_packs is None
            else self._majal_capability_records(capability_packs)
        )
        packs = self._majal_validate_capability_packs(role, packs)
        desired_ids = self._majal_group_ids_for(
            role, scope, packs, company=self.company_id)
        old_values = {
            "role": self.majal_role_id.code if self.majal_role_id else False,
            "scope": self.majal_industry_scope,
            "capabilities": sorted(
                self.majal_capability_pack_ids.mapped("code")
            ),
            "groups": sorted(self.groups_id.mapped("full_name")),
        }
        # Roles are an allowlist, not an overlay. Preserving arbitrary legacy
        # groups silently leaves field users as Purchase, Inventory, Website
        # or Technical administrators.
        new_ids = desired_ids
        # sudo() is what tells write() this is the sanctioned path.
        self.sudo().write(
            {
                "majal_role_id": role.id,
                "majal_industry_scope": scope,
                "majal_capability_pack_ids": [(6, 0, packs.ids)],
                "groups_id": [(6, 0, sorted(new_ids))],
            }
        )
        self.env["majal.admin.audit"]._log(
            "access_changed",
            _("Access changed for %s to %s (%s).")
            % (self.name, role.name, scope),
            target_user=self,
            old_values=old_values,
            new_values={
                "role": role.code,
                "scope": scope,
                "capabilities": sorted(packs.mapped("code")),
                "groups": sorted(self.groups_id.mapped("full_name")),
            },
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

    @api.model
    def action_open_majal_client_users(self):
        self._majal_check_can_administer()
        action = self.env["ir.actions.actions"]._for_xml_id(
            "majal_administration.action_majal_client_users"
        )
        if not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            action["domain"] = [("company_id", "=", self.env.company.id)]
            action["context"] = {
                "default_company_id": self.env.company.id,
                "allowed_company_ids": [self.env.company.id],
            }
        return action

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
        self.env["majal.admin.audit"]._log(
            "user_reactivated" if new_active else "user_deactivated",
            _("%s was %s.")
            % (self.name, _("reactivated") if new_active else _("deactivated")),
            target_user=self,
            old_values={"active": not new_active},
            new_values={"active": new_active},
        )
        return {"type": "ir.actions.client", "tag": "reload"}
