from odoo import api, fields, models

from . import cpm


class ProjectTask(models.Model):
    _inherit = "project.task"

    wbs_code = fields.Char(string="WBS")
    is_milestone = fields.Boolean()
    planned_duration = fields.Integer(
        string="Duration (working days)",
        default=1,
        help="Working days the activity occupies. Ignored for milestones.",
    )
    constraint_date = fields.Date(
        string="Start No Earlier Than",
        help="Optional constraint: the activity cannot start before this date.",
    )
    # Scheduled bar (set by the CPM engine, editable for manual override).
    planned_start = fields.Datetime(string="Scheduled Start")
    planned_finish = fields.Datetime(string="Scheduled Finish")
    progress = fields.Float(string="% Complete")

    # CPM outputs (read-only, filled by project reschedule).
    cpm_early_start = fields.Date(readonly=True)
    cpm_early_finish = fields.Date(readonly=True)
    cpm_late_start = fields.Date(readonly=True)
    cpm_late_finish = fields.Date(readonly=True)
    total_float = fields.Integer(
        string="Total Float (days)", readonly=True,
        help="Working days the activity can slip without delaying the project.",
    )
    is_critical = fields.Boolean(readonly=True, index=True)

    # Baseline (Primavera 'target' schedule) + variance tracking.
    baseline_start = fields.Datetime(readonly=True)
    baseline_finish = fields.Datetime(readonly=True)
    finish_variance_days = fields.Integer(
        compute="_compute_finish_variance", store=True,
        string="Finish Variance (wd)",
        help="Working days the scheduled finish has slipped (+) or gained (-) "
        "against the baseline.",
    )

    predecessor_link_ids = fields.One2many(
        "construction.task.link", "successor_id", string="Predecessors"
    )
    successor_link_ids = fields.One2many(
        "construction.task.link", "predecessor_id", string="Successors"
    )
    predecessor_task_ids = fields.Many2many(
        "project.task",
        compute="_compute_predecessor_task_ids",
        string="Predecessor Activities",
        help="Used to draw dependency arrows on the timeline.",
    )

    @api.depends("predecessor_link_ids.predecessor_id")
    def _compute_predecessor_task_ids(self):
        for task in self:
            task.predecessor_task_ids = task.predecessor_link_ids.mapped(
                "predecessor_id"
            )

    @api.depends("baseline_finish", "planned_finish")
    def _compute_finish_variance(self):
        for task in self:
            if task.baseline_finish and task.planned_finish:
                task.finish_variance_days = cpm.working_days_between(
                    task.baseline_finish.date(), task.planned_finish.date()
                )
            else:
                task.finish_variance_days = 0

    def action_reschedule_project(self):
        """Reschedule the whole project this activity belongs to."""
        projects = self.mapped("project_id")
        return projects.action_reschedule()
