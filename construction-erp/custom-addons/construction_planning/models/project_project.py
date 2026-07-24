from datetime import datetime, time

from odoo import fields, models

from . import cpm


class ProjectProject(models.Model):
    _inherit = "project.project"

    def action_reschedule(self):
        """Run the CPM engine over the project's activities and write the
        computed schedule (early/late dates, float, critical path)."""
        for project in self:
            tasks = self.env["project.task"].search(
                [("project_id", "=", project.id)]
            )
            if not tasks:
                continue
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
        return True
