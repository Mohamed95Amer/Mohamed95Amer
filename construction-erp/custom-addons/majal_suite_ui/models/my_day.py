"""What one person has to do today, gathered from wherever it lives.

The data was always there — defects carry an assignee, inspections an
inspector, tasks a user, approvals a step — but nothing put it on one screen.
There was exactly one "my ..." filter in the whole suite, so a site engineer
started the day by opening five registers and filtering each one by hand, and
the honest result is that the fifth one did not get opened.

Counts are read with `search_count` rather than by loading records: this runs
on the home screen for everyone, every morning, and the number is all it needs.
"""

from odoo import api, fields, models


class ConstructionMyDay(models.AbstractModel):
    _name = "construction.my.day"
    _description = "My Day"

    @api.model
    def _sections(self):
        """Each section: what it is, how many, and where the full list lives.

        Ordered by how much trouble it causes to ignore. Approvals first —
        somebody else is stopped until it is done — then anything overdue, then
        today's work.
        """
        user = self.env.user
        today = fields.Date.context_today(self)
        sections = []

        # Every lookup below is guarded by has_access. This screen is the home
        # screen for *everyone*, and the registers on it belong to different
        # halves of the product: a facilities technician has no construction
        # rights and a site engineer has no maintenance rights, so on any
        # mixed install somebody is always reading a register they are not
        # allowed to. Unguarded, that is an AccessError where a screen should
        # be — the whole of My Day fails, not just the row.
        # env.get, not env[...]: the shell ships without construction_base on
        # a Facilities- or Property-only install, and a missing model must
        # drop one section rather than raise on the home screen.
        step = self.env.get("construction.approval.step")
        waiting = (
            step._waiting_on(user)
            if step is not None and step.has_access("read")
            else self.env["mail.followers"].browse()
        )
        if waiting:
            sections.append({
                "key": "approvals",
                "label": self.env._("Waiting for my approval"),
                "count": len(waiting),
                "urgent": len(waiting.filtered(lambda s: s.waiting_days > 3)),
                "icon": "fa-check-square-o",
                "action": self._action_for(
                    self.env._("Waiting for my approval"),
                    "construction.approval.step",
                    [("id", "in", waiting.ids)]),
            })

        for entry in self._registers():
            if entry.get("group") and not user.has_group(entry["group"]):
                continue
            model = self.env.get(entry["model"])
            # `is None` covers a module that is not installed; has_access
            # covers one that is installed but not this person's job.
            if model is None or not model.has_access("read"):
                continue
            domain = entry["domain"](user, today)
            count = model.search_count(domain)
            if not count:
                continue
            sections.append({
                "key": entry["key"],
                "label": entry["label"],
                "count": count,
                "urgent": model.search_count(
                    domain + entry["urgent"](today)) if entry.get("urgent") else 0,
                "icon": entry["icon"],
                "action": self._action_for(
                    entry["label"], entry["model"], domain),
            })
        return sections

    @api.model
    def _candidate_ids(self, model_name, domain):
        """Resolve relation membership without leaking inaccessible records.

        Odoo expands an x2many membership leaf through the related model and
        applies that model's record rules.  My Day spans applications, so a
        perfectly valid task/PM query could fail on an unrelated ``res.users``
        rule.  Sudo is used only to resolve candidate ids; the caller then
        performs the real count and action with the current user's rules.
        """
        return self.env[model_name].sudo().search(domain).ids

    @api.model
    def _action_for(self, name, model, domain):
        """An action the web client can run as-is.

        `views` rather than `view_mode` alone: this is fetched with an ORM call
        and handed straight to doAction, and only actions returned from a
        *button* are normalised server-side. Without it the client throws while
        preprocessing and the row silently does nothing — which is the third
        time this exact shape has bitten in this project.
        """
        return {
            "type": "ir.actions.act_window",
            "name": name,
            "res_model": model,
            "views": [[False, "list"], [False, "form"]],
            "view_mode": "list,form",
            "target": "current",
            "domain": domain,
        }

    @api.model
    def _registers(self):
        """The registers a person's own work lives in.

        A list rather than hard-coded blocks so another module can add its own
        without editing this one — the facilities side will want work orders
        here, and it should not have to change a construction file to get them.
        """
        return [
            {
                "key": "defects",
                "label": self.env._("Defects assigned to me"),
                "model": "construction.defect",
                "group": "construction_base.group_construction_user",
                "icon": "fa-exclamation-triangle",
                "domain": lambda user, today: [
                    ("assigned_user_id", "=", user.id),
                    ("state", "in", ("open", "in_progress", "reopened")),
                ],
                "urgent": lambda today: [("date_required", "<", today)],
            },
            {
                "key": "inspections",
                "label": self.env._("My inspections"),
                "model": "construction.form.inspection",
                "group": "construction_base.group_construction_user",
                "icon": "fa-clipboard",
                "domain": lambda user, today: [
                    ("inspector_id", "=", user.id),
                    ("state", "in", ("draft", "in_progress")),
                ],
                "urgent": lambda today: [("scheduled_date", "<=", today)],
            },
            {
                "key": "tasks",
                "label": self.env._("My tasks"),
                "model": "project.task",
                "group": "construction_base.group_construction_user",
                "icon": "fa-tasks",
                "domain": lambda user, today: [
                    ("id", "in", self._candidate_ids("project.task", [
                        ("user_ids", "=", user.id),
                        ("project_id.is_construction", "=", True),
                        ("state", "in", (
                            "01_in_progress", "02_changes_requested",
                            "03_approved",
                        )),
                    ])),
                ],
                "urgent": lambda today: [("date_deadline", "<", today)],
            },
            {
                "key": "rfis",
                "label": self.env._("RFIs in my court"),
                "model": "construction.rfi",
                "group": "construction_base.group_construction_user",
                "icon": "fa-question-circle",
                "domain": lambda user, today: [
                    ("ball_in_court_id", "=", user.partner_id.id),
                    ("state", "not in", ("closed", "cancelled")),
                ],
                "urgent": lambda today: [("date_required", "<", today)],
            },
            {
                # The supervisor is the person standing under the permit, so
                # they are the one who needs to know it runs out at four.
                "key": "permits",
                "label": self.env._("Permits I supervise"),
                "model": "construction.permit",
                "group": "construction_base.group_construction_user",
                "icon": "fa-fire-extinguisher",
                "domain": lambda user, today: [
                    ("supervisor_id", "=", user.id),
                    ("state", "in", ("approved", "active")),
                ],
                "urgent": lambda today: [
                    ("valid_to", "<=", fields.Datetime.now()),
                ],
            },
            # Facilities. This screen was shared verbatim by both roots, so a
            # facilities technician opened "My Day" and was shown a
            # construction engineer's RFIs and permits and none of their own
            # work orders. Nothing needs to know which kind of user is
            # looking: _sections() drops any register that returns zero, so
            # each person sees only the registers they actually appear in.
            {
                "key": "work_orders",
                "label": self.env._("Work orders assigned to me"),
                "model": "maintenance.request",
                "icon": "fa-wrench",
                "domain": lambda user, today: [
                    ("user_id", "=", user.id),
                    ("stage_id.done", "=", False),
                ],
                # The SLA clock, not the scheduled date: a work order is late
                # when the promise is missed, which is the number the client
                # holds the company to.
                "urgent": lambda today: [
                    ("sla_resolution_deadline", "<=", fields.Datetime.now()),
                ],
            },
            {
                # A PM plan names no person — it names an asset and a team —
                # so this is the one register here scoped by team membership
                # rather than by assignment. Falling due is a team's problem
                # until someone picks it up.
                "key": "pm_due",
                "label": self.env._("Planned maintenance falling due"),
                "model": "facility.pm.plan",
                "icon": "fa-calendar-check-o",
                "domain": lambda user, today: [
                    ("id", "in", self._candidate_ids("facility.pm.plan", [
                        ("trigger_type", "=", "calendar"),
                        ("next_date", "<=", today),
                        ("maintenance_team_id.member_ids", "=", user.id),
                    ])),
                ],
                "urgent": lambda today: [("next_date", "<", today)],
            },
        ]

    @api.model
    def my_day(self):
        """The payload the home screen draws."""
        sections = self._sections()
        return {
            "user": self.env.user.display_name,
            "date": fields.Date.to_string(fields.Date.context_today(self)),
            "sections": sections,
            "total": sum(section["count"] for section in sections),
            "urgent": sum(section.get("urgent") or 0 for section in sections),
        }

    @api.model
    def action_my_day(self):
        return {
            "type": "ir.actions.client",
            "tag": "construction_ui.my_day",
            "name": self.env._("My Day"),
        }
