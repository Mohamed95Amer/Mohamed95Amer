from datetime import datetime, time

from odoo import api, fields, models

from . import cpm


class ProjectProject(models.Model):
    _inherit = "project.project"

    scheduled_start = fields.Date(
        readonly=True, help="Earliest scheduled activity start (CPM).")
    scheduled_finish = fields.Date(
        readonly=True, help="Latest scheduled activity finish (CPM).")
    schedule_duration_days = fields.Integer(
        string="Programme Duration (wd)", readonly=True,
        help="Working days between scheduled start and finish.")
    critical_task_count = fields.Integer(readonly=True)
    last_rescheduled = fields.Datetime(readonly=True)
    baseline_date = fields.Datetime(
        readonly=True, help="When the current baseline was captured.")

    def action_reschedule(self):
        """Run the CPM engine over the project's activities, write the
        computed schedule and report the result to the user."""
        total_tasks = 0
        for project in self:
            tasks = self.env["project.task"].search(
                [("project_id", "=", project.id)]
            )
            if not tasks:
                continue
            total_tasks += len(tasks)
            task_data = {
                t.id: {
                    "duration": max(t.planned_duration, 1),
                    "milestone": t.is_milestone,
                    "snet": t.constraint_date,
                }
                for t in tasks
            }
            links = self.env["construction.task.link"].search(
                [("project_id", "=", project.id)]
            )
            link_data = [
                {
                    "pred": l.predecessor_id.id,
                    "succ": l.successor_id.id,
                    "type": l.link_type,
                    "lag": l.lag_days,
                }
                for l in links
                if l.predecessor_id.id in task_data
                and l.successor_id.id in task_data
            ]
            project_start = (
                project.date_commencement or fields.Date.context_today(self)
            )
            schedule = cpm.compute_schedule(task_data, link_data, project_start)
            for t in tasks:
                res = schedule[t.id]
                t.write(
                    {
                        "cpm_early_start": res["early_start"],
                        "cpm_early_finish": res["early_finish"],
                        "cpm_late_start": res["late_start"],
                        "cpm_late_finish": res["late_finish"],
                        "total_float": res["total_float"],
                        "is_critical": res["is_critical"],
                        "planned_start": datetime.combine(
                            res["early_start"], time(8, 0)
                        ),
                        "planned_finish": datetime.combine(
                            res["early_finish"], time(17, 0)
                        ),
                    }
                )
            starts = [s["early_start"] for s in schedule.values()]
            finishes = [s["early_finish"] for s in schedule.values()]
            project.write(
                {
                    "scheduled_start": min(starts),
                    "scheduled_finish": max(finishes),
                    "schedule_duration_days": cpm.working_days_between(
                        min(starts), max(finishes)
                    ) + 1,
                    "critical_task_count": len(
                        [s for s in schedule.values() if s["is_critical"]]
                    ),
                    "last_rescheduled": fields.Datetime.now(),
                }
            )
        return self._notify_reschedule(total_tasks)

    def _notify_reschedule(self, total_tasks):
        if not total_tasks:
            message = self.env._("No activities to schedule in this project.")
            notif_type = "warning"
        elif len(self) == 1:
            message = self.env._(
                "%(count)s activities scheduled — %(critical)s on the critical "
                "path. Programme finish: %(finish)s (%(days)s working days).",
                count=total_tasks,
                critical=self.critical_task_count,
                finish=self.scheduled_finish or "-",
                days=self.schedule_duration_days,
            )
            notif_type = "success"
        else:
            message = self.env._(
                "%(count)s activities scheduled across %(projects)s projects.",
                count=total_tasks, projects=len(self),
            )
            notif_type = "success"
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": self.env._("Programme rescheduled"),
                "message": message,
                "type": notif_type,
                "next": {"type": "ir.actions.client", "tag": "soft_reload"},
            },
        }

    def action_set_baseline(self):
        """Capture the current schedule as the baseline (Primavera 'target')
        so later reschedules can be compared against it."""
        for project in self:
            tasks = self.env["project.task"].search(
                [("project_id", "=", project.id)]
            )
            for t in tasks:
                t.write(
                    {
                        "baseline_start": t.planned_start,
                        "baseline_finish": t.planned_finish,
                    }
                )
            project.baseline_date = fields.Datetime.now()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": self.env._("Baseline captured"),
                "message": self.env._(
                    "Current schedule saved as baseline. Future reschedules "
                    "will show variance against it."
                ),
                "type": "success",
                "next": {"type": "ir.actions.client", "tag": "soft_reload"},
            },
        }
