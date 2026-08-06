"""Who works on what, and — because they are the same thing here — who sees it.

Majal already decided that project membership is what governs visibility:
`majal_administration/models/tenant_security.py` generates a global rule for
every project-scoped model saying that anyone below rank 40 sees only records
whose project names them in `majal_member_ids`. Facilities works the same way
through `facility.location.member_user_ids`.

What was missing was a way for a human to say it, and any notion of the people
who do not have a login — which on a construction site is most of them.

So an allocation is the source of truth, and those membership fields become a
projection of it. Nothing in tenant_security.py changes; the rules keep reading
exactly the fields they always read. That also leaves intact the four
hand-written domains in majal_documents that reference
`project_id.majal_member_ids` directly.
"""

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.osv import expression


class MajalAllocation(models.Model):
    _name = "majal.allocation"
    _description = "Majal Workforce Allocation"
    _order = "date_start desc, id desc"
    _rec_name = "employee_id"

    employee_id = fields.Many2one(
        "hr.employee",
        string="Person",
        required=True,
        ondelete="restrict",
        index=True,
    )
    # Stored rather than related-on-the-fly because it is the key the
    # projection groups by, and an unstored related field cannot be searched.
    user_id = fields.Many2one(
        "res.users",
        string="System account",
        related="employee_id.user_id",
        store=True,
        index=True,
    )
    project_id = fields.Many2one(
        "project.project",
        string="Project",
        ondelete="cascade",
        index=True,
        domain="[('is_construction', '=', True)]",
    )
    location_id = fields.Many2one(
        "facility.location",
        string="Location",
        ondelete="cascade",
        index=True,
    )
    target_kind = fields.Selection(
        [("project", "Project"), ("location", "Location")],
        compute="_compute_target_kind",
        store=True,
    )
    role_id = fields.Many2one(
        "majal.allocation.role", string="Role", required=True)
    date_start = fields.Date(
        required=True, default=fields.Date.context_today, index=True)
    date_end = fields.Date(
        string="Until",
        index=True,
        help="Leave empty while the person is still on the work. Setting a "
             "date is what eventually takes their access away.",
    )
    allocation_percent = fields.Float(
        string="% of time", default=100.0,
        help="How much of this person's week the work is expected to take. "
             "Advisory: two projects at 80% is a real week on a real site, so "
             "it is reported rather than refused.",
    )
    grants_access = fields.Boolean(
        string="Grants access",
        default=True,
        help="Uncheck to record somebody on the work without letting them see "
             "it in the system — a planned start, or agency labour.",
    )
    cascade_children = fields.Boolean(
        string="Include everything below",
        default=True,
        help="A location allocation covers the buildings, floors and rooms "
             "inside it. Uncheck to pin somebody to one floor.",
    )
    state = fields.Selection(
        [("planned", "Planned"), ("active", "Active"), ("ended", "Ended")],
        compute="_compute_state",
        store=True,
        index=True,
    )
    is_retained = fields.Boolean(
        string="Held past its end date",
        readonly=True,
        help="This allocation has ended, but the person still holds approvals "
             "on this project, so their access has been kept rather than "
             "leaving those approvals stranded.",
    )
    is_overallocated = fields.Boolean(
        compute="_compute_is_overallocated", store=True)
    origin = fields.Selection(
        [
            ("manual", "Entered"),
            ("backfill", "Existing team, on upgrade"),
            ("adopted", "Added directly to the team"),
        ],
        default="manual",
        required=True,
        readonly=True,
    )
    company_id = fields.Many2one(
        "res.company", compute="_compute_company_id", store=True, index=True)
    note = fields.Char()
    active = fields.Boolean(default=True)

    _sql_constraints = [
        # Exactly one target. Expressed in SQL because a Python constraint can
        # be skipped by a bulk write that never loads the records.
        ("one_target",
         "CHECK ((project_id IS NULL) != (location_id IS NULL))",
         "An allocation is to a project or to a location, not both and not "
         "neither."),
        ("dates", "CHECK (date_end IS NULL OR date_end >= date_start)",
         "An allocation cannot end before it starts."),
        ("percent", "CHECK (allocation_percent > 0)",
         "An allocation of nothing is not an allocation."),
    ]

    # ------------------------------------------------------------------
    # Computes
    # ------------------------------------------------------------------
    @api.depends("project_id", "location_id")
    def _compute_target_kind(self):
        for allocation in self:
            allocation.target_kind = (
                "project" if allocation.project_id else "location")

    @api.depends("project_id.company_id", "location_id.company_id")
    def _compute_company_id(self):
        for allocation in self:
            target = allocation.project_id or allocation.location_id
            allocation.company_id = target.company_id

    @api.depends("date_start", "date_end")
    def _compute_state(self):
        today = fields.Date.context_today(self)
        for allocation in self:
            if allocation.date_start and allocation.date_start > today:
                allocation.state = "planned"
            elif allocation.date_end and allocation.date_end < today:
                allocation.state = "ended"
            else:
                allocation.state = "active"

    @api.depends("employee_id", "date_start", "date_end", "allocation_percent")
    def _compute_is_overallocated(self):
        for allocation in self:
            if not allocation.employee_id:
                allocation.is_overallocated = False
                continue
            segments = allocation._capacity_segments(
                allocation.employee_id,
                allocation.date_start,
                allocation.date_end,
            )
            allocation.is_overallocated = any(
                total > 100.0 and allocation.id in ids
                for _start, _end, total, ids in segments
            )

    # ------------------------------------------------------------------
    # Capacity
    # ------------------------------------------------------------------
    @api.model
    def _capacity_segments(self, employee, date_from=None, date_to=None):
        """Break a person's commitments into spans of constant load.

        Summing percentages across "overlapping" allocations is wrong the
        moment two ranges only partly overlap: a person on 60% all year and
        80% for one week is over-allocated for that week and fine either side
        of it, and a naive sum reports either the whole year or nothing.

        So collect every boundary date, walk the spans between them, and total
        the allocations live in each. Returns [(start, end, percent, ids)],
        end being None for the open-ended tail. Pure and side-effect free
        because everything else — the badge, the constraint, the workload
        view — reads it, and it is where the arithmetic bugs would hide.
        """
        allocations = self.sudo().search([
            ("employee_id", "=", employee.id),
            ("active", "=", True),
        ])
        if not allocations:
            return []

        boundaries = set()
        for allocation in allocations:
            boundaries.add(allocation.date_start)
            if allocation.date_end:
                # The day after the end is where the load changes.
                boundaries.add(
                    fields.Date.add(allocation.date_end, days=1))
        points = sorted(boundaries)

        segments = []
        for index, start in enumerate(points):
            end = None
            if index + 1 < len(points):
                end = fields.Date.subtract(points[index + 1], days=1)
            live = allocations.filtered(
                lambda a, s=start: a.date_start <= s
                and (not a.date_end or a.date_end >= s)
            )
            if not live:
                continue
            if date_to and start > date_to:
                continue
            if date_from and end and end < date_from:
                continue
            segments.append((
                start,
                end,
                sum(live.mapped("allocation_percent")),
                set(live.ids),
            ))
        return segments

    # ------------------------------------------------------------------
    # Constraints
    # ------------------------------------------------------------------
    @api.constrains("employee_id", "company_id")
    def _check_company(self):
        for allocation in self:
            employee_company = allocation.employee_id.company_id
            if (
                employee_company
                and allocation.company_id
                and employee_company != allocation.company_id
            ):
                raise ValidationError(_(
                    "%(person)s belongs to %(theirs)s and cannot be allocated "
                    "to work owned by %(target)s.",
                    person=allocation.employee_id.display_name,
                    theirs=employee_company.display_name,
                    target=allocation.company_id.display_name,
                ))

    @api.constrains("employee_id", "project_id", "location_id", "role_id",
                    "date_start", "date_end")
    def _check_no_duplicate_span(self):
        for allocation in self:
            target_field = (
                "project_id" if allocation.project_id else "location_id")
            target = allocation.project_id or allocation.location_id
            overlapping = self.sudo().search([
                ("id", "!=", allocation.id),
                ("employee_id", "=", allocation.employee_id.id),
                (target_field, "=", target.id),
                ("role_id", "=", allocation.role_id.id),
                ("active", "=", True),
                ("date_start", "<=", allocation.date_end or "2999-12-31"),
                "|",
                ("date_end", "=", False),
                ("date_end", ">=", allocation.date_start),
            ])
            if overlapping:
                raise ValidationError(_(
                    "%(person)s is already allocated to %(target)s as "
                    "%(role)s over these dates.",
                    person=allocation.employee_id.display_name,
                    target=target.display_name,
                    role=allocation.role_id.display_name,
                ))

    # ------------------------------------------------------------------
    # Write path — every change re-projects the targets it touched
    # ------------------------------------------------------------------
    @api.model_create_multi
    def create(self, vals_list):
        allocations = super().create(vals_list)
        allocations._majal_sync_targets()
        return allocations

    def write(self, vals):
        # Targets before and after: moving somebody off a project has to
        # re-project the one they left as well as the one they joined.
        before = self._majal_targets()
        result = super().write(vals)
        self._majal_sync_targets(extra=before)
        return result

    def unlink(self):
        targets = self._majal_targets()
        result = super().unlink()
        self._majal_sync_records(targets)
        return result

    def _majal_targets(self):
        return {
            ("project", allocation.project_id.id) if allocation.project_id
            else ("location", allocation.location_id.id)
            for allocation in self
        }

    def _majal_sync_targets(self, extra=None):
        self._majal_sync_records(self._majal_targets() | (extra or set()))

    @api.model
    def _majal_sync_records(self, targets):
        projects = self.env["project.project"].sudo().browse(
            [rid for kind, rid in targets if kind == "project" and rid])
        locations = self.env["facility.location"].sudo().browse(
            [rid for kind, rid in targets if kind == "location" and rid])
        projects.exists()._majal_project_membership()
        locations.exists()._majal_location_membership()
        return True

    # ------------------------------------------------------------------
    # The projection
    # ------------------------------------------------------------------
    @api.model
    def _majal_grace_days(self):
        return int(self.env["ir.config_parameter"].sudo().get_param(
            "majal_workforce.grace_days", 7))

    @api.model
    def _majal_effective_domain(self):
        """Allocations that should currently grant access.

        Includes allocations whose end date has just passed: a leaving date is
        rarely the day the handover finishes, and a hard cliff turns a normal
        departure into a support call.
        """
        today = fields.Date.context_today(self)
        cutoff = fields.Date.subtract(today, days=self._majal_grace_days())
        return [
            ("active", "=", True),
            ("grants_access", "=", True),
            ("role_id.grants_access", "=", True),
            ("user_id", "!=", False),
            ("date_start", "<=", today),
            "|",
            ("date_end", "=", False),
            ("date_end", ">=", cutoff),
        ]

    @api.model
    def _majal_users_holding_approvals(self, project):
        """Who must not be removed from this project yet.

        Approval requests and steps are not project-scoped — they are absent
        from CONSTRUCTION_PROJECT_MODELS — but the documents they gate are. So
        revoking somebody mid-approval leaves the step sitting in their inbox
        pointing at a record they can no longer open: the approval is stuck,
        and nothing about it looks wrong. Keeping their access until the
        approval is dealt with is the cheap half of the fix; the end-allocation
        wizard offering a delegation is the other half.
        """
        steps = self.env["construction.approval.step"].sudo().search([
            ("state", "=", "pending"),
            ("request_id.state", "=", "pending"),
            ("request_id.project_id", "=", project.id),
        ])
        return steps.mapped("user_id") | steps.mapped("group_id.users")

    # ------------------------------------------------------------------
    # Cron
    # ------------------------------------------------------------------
    @api.model
    def _cron_sync_membership(self):
        """Make dates take effect, and report anything that has drifted.

        Nothing lapses on its own: the rules read the membership fields live,
        so an allocation that ended last night keeps granting access until
        something re-projects. This is that something, which is also why
        revocation is unattended and why the grace period and the chatter note
        on removal both exist.
        """
        self.env["project.project"].sudo().search(
            [("is_construction", "=", True)])._majal_project_membership()
        self.env["facility.location"].sudo().search(
            [])._majal_location_membership()
        self._majal_refresh_states()
        return True

    @api.model
    def _majal_refresh_states(self):
        """`state` is stored so it can be searched and grouped, which means a
        date rolling over does not move it on its own."""
        stale = self.sudo().search([("active", "in", (True, False))])
        stale.modified(["date_start", "date_end"])
        stale._compute_state()
        return True
