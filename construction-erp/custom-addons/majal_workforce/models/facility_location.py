from odoo import _, api, fields, models

SYNC_KEY = "majal_allocation_sync"


class FacilityLocation(models.Model):
    _inherit = "facility.location"

    allocation_ids = fields.One2many(
        "majal.allocation", "location_id", string="Team")
    allocation_count = fields.Integer(compute="_compute_allocation_count")

    def _compute_allocation_count(self):
        counts = dict(self.env["majal.allocation"]._read_group(
            [("location_id", "in", self.ids), ("state", "!=", "ended")],
            ["location_id"],
            ["__count"],
        ))
        for location in self:
            location.allocation_count = counts.get(location, 0)

    # ------------------------------------------------------------------
    # The projection, with inheritance down the tree
    # ------------------------------------------------------------------
    def _majal_location_membership(self):
        """Rewrite member_user_ids from allocations, including inherited ones.

        The inheritance is not a nicety. Every facilities rule in
        tenant_security.py reaches an asset's location by its *exact* id —
        `facility_location_id.member_user_ids` — and Odoo cannot express "a
        location any of whose ancestors names me" as a single domain leaf, so
        the rules cannot be taught to walk the tree. Without materialising it
        here, allocating a technician to a building would leave them blind to
        every floor and room inside it, which is most of facilities
        management.

        So an allocation to a site is written onto the site and everything
        beneath it. Pinning somebody to one floor is still possible: that is
        what cascade_children is for.
        """
        Allocation = self.env["majal.allocation"].sudo()
        # Re-project the whole subtree of anything named, since a change high
        # up changes membership far below it.
        family = self.sudo().search([("id", "child_of", self.ids)])
        for location in family:
            ancestors = self.sudo().search([("id", "parent_of", location.id)])
            allocations = Allocation.search(
                [
                    ("location_id", "in", ancestors.ids),
                    "|",
                    ("location_id", "=", location.id),
                    ("cascade_children", "=", True),
                ]
                + Allocation._majal_effective_domain()
            )
            wanted = allocations.mapped("user_id")
            current = location.member_user_ids
            if wanted == current:
                continue
            removed = current - wanted
            location.with_context(**{SYNC_KEY: True}).write(
                {"member_user_ids": [fields.Command.set(wanted.ids)]})
            if removed and hasattr(location, "message_post"):
                location.message_post(body=_(
                    "Removed from the location team: %s",
                    ", ".join(removed.mapped("name")),
                ))
        return True

    @api.model_create_multi
    def create(self, vals_list):
        locations = super().create(vals_list)
        locations._majal_location_membership()
        return locations

    def write(self, vals):
        adopt = (
            "member_user_ids" in vals
            and not self.env.context.get(SYNC_KEY)
            and not self.env.context.get("majal_workforce_backfill")
        )
        before = {loc.id: loc.member_user_ids for loc in self} if adopt else {}
        result = super().write(vals)
        if adopt:
            for location in self:
                added = location.member_user_ids - before.get(
                    location.id, self.env["res.users"])
                if added:
                    location._majal_adopt_members(added)
        if "parent_id" in vals:
            # Reshaping the tree changes who inherits what.
            self._majal_location_membership()
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
            if Allocation.search_count([
                ("employee_id", "=", employee.id),
                ("location_id", "=", self.id),
                ("date_end", "=", False),
            ]):
                continue
            Allocation.create({
                "employee_id": employee.id,
                "location_id": self.id,
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
            "context": {"default_location_id": self.id},
        }
