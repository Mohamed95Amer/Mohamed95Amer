from odoo import _, api, fields, models

SYNC_KEY = "majal_allocation_sync"


class ProjectProject(models.Model):
    _inherit = "project.project"

    allocation_ids = fields.One2many(
        "majal.allocation", "project_id", string="Team")
    allocation_count = fields.Integer(compute="_compute_allocation_count")

    def _compute_allocation_count(self):
        counts = dict(self.env["majal.allocation"]._read_group(
            [("project_id", "in", self.ids), ("state", "!=", "ended")],
            ["project_id"],
            ["__count"],
        ))
        for project in self:
            project.allocation_count = counts.get(project, 0)

    # ------------------------------------------------------------------
    # The projection
    # ------------------------------------------------------------------
    def _majal_project_membership(self):
        """Rewrite majal_member_ids from the allocations that grant access.

        Deliberately not a computed field. A compute would fight the direct
        writes that majal_demo and two test files already make, and would give
        the security machinery a field whose value depends on a stored compute
        being up to date — which is exactly the class of upgrade bug this
        codebase has been bitten by before. A plain projection, re-run by the
        allocation write path and by a daily cron, fails loudly instead.

        Note what is *not* projected: majal_manager_id. Every generated rule
        compares it with `=`, so it holds one person, and two overlapping lead
        allocations would take turns overwriting each other. Leads go into the
        members set like everyone else and the manager field stays where an
        administrator put it.
        """
        Allocation = self.env["majal.allocation"].sudo()
        for project in self.sudo():
            allocations = Allocation.search(
                [("project_id", "=", project.id)]
                + Allocation._majal_effective_domain()
            )
            wanted = allocations.mapped("user_id")
            # Never strip access from somebody mid-approval.
            retained = (
                Allocation._majal_users_holding_approvals(project)
                & project.majal_member_ids
            )
            wanted |= retained
            current = project.majal_member_ids
            if wanted == current:
                continue
            removed = current - wanted
            project.with_context(**{SYNC_KEY: True}).write(
                {"majal_member_ids": [fields.Command.set(wanted.ids)]})
            if removed:
                # A membership change nobody can see afterwards is the failure
                # mode; the chatter is the record that it happened.
                project.message_post(body=_(
                    "Removed from the project team: %s",
                    ", ".join(removed.mapped("name")),
                ))
        return True

    def write(self, vals):
        """A direct write to the team is a request to allocate.

        Nothing in the product wrote this field before allocations existed —
        only demo data and two tests — so there is no legacy behaviour worth
        preserving by letting manual edits win. But silently reverting them on
        the next cron sweep would be worse than either. Adopting them keeps
        old data working, keeps the sweep a no-op, and leaves one source of
        truth.
        """
        adopt = (
            "majal_member_ids" in vals
            and not self.env.context.get(SYNC_KEY)
            and not self.env.context.get("majal_workforce_backfill")
        )
        before = {p.id: p.majal_member_ids for p in self} if adopt else {}
        result = super().write(vals)
        if adopt:
            for project in self:
                added = project.majal_member_ids - before.get(
                    project.id, self.env["res.users"])
                if added:
                    project._majal_adopt_members(added)
        return result

    def _majal_adopt_members(self, users):
        Allocation = self.env["majal.allocation"].sudo()
        role = self.env.ref(
            "majal_workforce.role_team_member", raise_if_not_found=False)
        if not role:
            return
        employees = self.env["hr.employee"].sudo()
        for user in users:
            employee = employees.search([("user_id", "=", user.id)], limit=1)
            if not employee:
                employee = employees.create({
                    "name": user.name,
                    "user_id": user.id,
                    "company_id": user.company_id.id,
                })
            existing = Allocation.search([
                ("employee_id", "=", employee.id),
                ("project_id", "=", self.id),
                ("date_end", "=", False),
            ], limit=1)
            if existing:
                continue
            Allocation.create({
                "employee_id": employee.id,
                "project_id": self.id,
                "role_id": role.id,
                "origin": "adopted",
            })

    def action_majal_allocate(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Allocate People"),
            "res_model": "majal.allocate.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_project_id": self.id},
        }
