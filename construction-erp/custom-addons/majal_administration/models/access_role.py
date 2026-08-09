from odoo import _, api, fields, models
from odoo.exceptions import AccessError, ValidationError


# Groups that decide who may administer the system. A level that grants one of
# these grants the ability to rewrite every other level, so only a Platform
# Owner may put them in one — otherwise a Company Administrator promotes
# themselves by editing the level they already hold.
RESERVED_GROUP_XMLIDS = (
    "majal_administration.group_platform_owner",
    "majal_administration.group_user_administrator",
    "majal_administration.group_backup_operator",
    "base.group_system",
    "base.group_erp_manager",
)

GROUP_FIELDS = (
    "group_ids",
    "construction_group_ids",
    "facility_group_ids",
    "real_estate_group_ids",
)


class MajalAccessRole(models.Model):
    """A named level of access, and the permissions it stands for.

    The six levels shipped with the module are a starting point rather than a
    fixed ladder: a company renames them to its own language and edits what
    each one grants. Those edits are stored as a company's own copy of the
    level, so one client's "Level 3" never becomes another client's.
    """

    _name = "majal.access.role"
    _description = "Majal Access Role"
    _order = "rank desc, name"

    name = fields.Char(required=True, translate=True)
    code = fields.Selection(
        [
            ("platform_owner", "Platform Owner"),
            ("company_admin", "Company Administrator"),
            ("operations_manager", "Operations Manager"),
            ("manager", "Project / Facility Manager"),
            ("supervisor", "Engineer / Supervisor"),
            ("field_user", "Field User / Technician"),
        ],
        required=True,
        index=True,
    )
    rank = fields.Integer(required=True, index=True)
    description = fields.Text(translate=True)
    active = fields.Boolean(default=True)

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        index=True,
        ondelete="cascade",
        help="Empty means the standard level shipped with Majal, shared by "
             "every company. A company that customises a level gets its own "
             "copy here, and only that company sees the change.",
    )
    group_ids = fields.Many2many(
        "res.groups",
        "majal_access_role_group_rel",
        "role_id",
        "group_id",
        string="Always granted",
    )
    construction_group_ids = fields.Many2many(
        "res.groups",
        "majal_access_role_construction_group_rel",
        "role_id",
        "group_id",
        string="Granted with construction access",
    )
    facility_group_ids = fields.Many2many(
        "res.groups",
        "majal_access_role_facility_group_rel",
        "role_id",
        "group_id",
        string="Granted with facilities access",
    )
    real_estate_group_ids = fields.Many2many(
        "res.groups",
        "majal_access_role_real_estate_group_rel",
        "role_id",
        "group_id",
        string="Granted with property access",
    )
    has_company_copy = fields.Boolean(compute="_compute_has_company_copy")

    def _compute_has_company_copy(self):
        company = self.env.company
        standards = self.filtered(lambda role: not role.company_id)
        copies = set()
        if standards:
            copies = set(self.search([
                ("code", "in", standards.mapped("code")),
                ("company_id", "=", company.id),
            ]).mapped("code"))
        for role in self:
            role.has_company_copy = (
                not role.company_id and role.code in copies)

    @api.constrains("code", "company_id")
    def _check_one_level_per_code_and_company(self):
        # Not a SQL constraint: Postgres treats every NULL company_id as
        # distinct, so unique(code, company_id) would happily allow two
        # standard levels sharing a code.
        for role in self:
            duplicate = self.search_count([
                ("id", "!=", role.id),
                ("code", "=", role.code),
                ("company_id", "=", role.company_id.id),
                ("active", "in", (True, False)),
            ])
            if duplicate:
                raise ValidationError(
                    _("This company already has a level for %s.")
                    % dict(self._fields["code"].selection)[role.code]
                )

    @api.model
    def _majal_effective(self, code, company):
        """The level that applies to ``company`` — its own copy, or the standard."""
        company_id = company.id if company else False
        own = self.search(
            [("code", "=", code), ("company_id", "=", company_id)], limit=1)
        if own:
            return own
        return self.search(
            [("code", "=", code), ("company_id", "=", False)], limit=1)

    def _majal_effective_for(self, company):
        self.ensure_one()
        if self.company_id:
            return self
        return self._majal_effective(self.code, company)

    # ------------------------------------------------------------------
    # Who may change a level, and to what
    # ------------------------------------------------------------------
    def _majal_check_editable(self, vals):
        """A level is a permission grant, so editing one is an escalation risk.

        Two rules, both aimed at the same thing: an administrator cannot use a
        level to acquire authority they were not given. They may not put the
        administration groups into a level at all, and they may not put in a
        group they do not themselves hold — you cannot hand out what you do
        not have.
        """
        actor = self.env.user
        if actor.has_group("majal_administration.group_platform_owner"):
            return
        if not actor.has_group("majal_administration.group_user_administrator"):
            raise AccessError(_("You are not allowed to change access levels."))

        company = actor.company_id
        for role in self:
            if not role.company_id:
                raise AccessError(
                    _("The standard levels are read-only. Use "
                      "\"Customise for this company\" to make your own copy.")
                )
            if role.company_id != company:
                raise AccessError(
                    _("You can only change the levels of your own company.")
                )
            if role.rank >= (actor.majal_role_id.rank or 0):
                raise AccessError(
                    _("You cannot change a level at or above your own.")
                )

        requested = self.env["res.groups"].browse(
            sorted(self._majal_requested_group_ids(vals)))
        reserved = {
            group.id
            for xmlid in RESERVED_GROUP_XMLIDS
            if (group := self.env.ref(xmlid, raise_if_not_found=False))
        }
        forbidden = requested.filtered(lambda group: group.id in reserved)
        if forbidden:
            raise AccessError(
                _("Only a Platform Owner can put administration permissions "
                  "into a level: %s")
                % ", ".join(forbidden.mapped("full_name"))
            )
        ungranted = requested - actor.groups_id
        if ungranted:
            raise AccessError(
                _("You can only grant permissions you hold yourself. You do "
                  "not have: %s")
                % ", ".join(ungranted.mapped("full_name"))
            )

    @api.model
    def _majal_requested_group_ids(self, vals):
        ids = set()
        for field in GROUP_FIELDS:
            for command in vals.get(field) or []:
                if command[0] == 4:
                    ids.add(command[1])
                elif command[0] == 6:
                    ids.update(command[2])
        return ids

    @api.model_create_multi
    def create(self, vals_list):
        roles = super().create(vals_list)
        # Checked after creation so the company and rank of the new row are
        # the ones being judged, not whatever the caller claimed.
        if not self.env.su:
            for role, vals in zip(roles, vals_list):
                role._majal_check_editable(vals)
        return roles

    def write(self, vals):
        if not self.env.su:
            self._majal_check_editable(vals)
        result = super().write(vals)
        if set(vals) & set(GROUP_FIELDS):
            self._majal_reapply_to_users()
        return result

    def _majal_reapply_to_users(self):
        """Push a changed level out to the people already on it.

        Without this, editing a level would only affect the next person
        assigned to it, and the company would believe it had changed access
        for everybody. Runs as superuser: it is the system carrying out an
        edit that was already authorised above, not a user granting itself
        anything.
        """
        users = self.env["res.users"]
        for role in self:
            domain = [
                ("majal_role_id.code", "=", role.code),
                ("active", "=", True),
            ]
            if role.company_id:
                domain.append(("company_id", "=", role.company_id.id))
            users |= users.sudo().search(domain)
        for user in users:
            # Only for users this level actually governs — a user in another
            # company may resolve the same code to a different level.
            if user.majal_role_id._majal_effective_for(user.company_id) in self:
                user.sudo()._majal_reapply_current_access()

    def action_majal_customise_for_company(self):
        """Make this company its own editable copy of a standard level."""
        self.ensure_one()
        self.env["res.users"]._majal_check_can_administer()
        company = self.env.company
        if self.company_id:
            raise ValidationError(_("This level already belongs to a company."))
        existing = self.search(
            [("code", "=", self.code), ("company_id", "=", company.id)], limit=1)
        copy = existing or self.sudo().copy({
            "company_id": company.id,
            "name": self.name,
        })
        return {
            "type": "ir.actions.act_window",
            "res_model": "majal.access.role",
            "res_id": copy.id,
            "view_mode": "form",
            "target": "current",
        }

    def name_get(self):
        return [(record.id, record.name) for record in self]
