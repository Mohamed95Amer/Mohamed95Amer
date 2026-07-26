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

        step = self.env["construction.approval.step"]
        waiting = step._waiting_on(user)
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
            model = self.env.get(entry["model"])
            if model is None:
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
                "icon": "fa-tasks",
                "domain": lambda user, today: [
                    ("user_ids", "in", user.id),
                    ("project_id.is_construction", "=", True),
                    ("state", "in", ("01_in_progress", "02_changes_requested",
                                     "03_approved")),
                ],
                "urgent": lambda today: [("date_deadline", "<", today)],
            },
            {
                "key": "rfis",
                "label": self.env._("RFIs in my court"),
                "model": "construction.rfi",
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
                "icon": "fa-fire-extinguisher",
                "domain": lambda user, today: [
                    ("supervisor_id", "=", user.id),
                    ("state", "in", ("approved", "active")),
                ],
                "urgent": lambda today: [
                    ("valid_to", "<=", fields.Datetime.now()),
                ],
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
