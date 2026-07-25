from odoo import api, fields, models


class ProjectTaskBoqLink(models.Model):
    """Ties programme activities to the bill items they deliver.

    The schedule and the bill were tracked separately: a planner marked an
    activity 80% complete while the QS certified 50% of the same work, and
    nothing in the system noticed. Both numbers are legitimate — the planner
    measures work done, the QS measures work agreed — so neither overwrites the
    other. Linking them exposes the gap instead, which is the number worth
    looking at: sustained optimism in the programme is how a job discovers late
    that it is behind, and a large gap the other way usually means measurement
    is lagging the site rather than the site being slow.
    """

    _inherit = "project.task"

    boq_line_ids = fields.Many2many(
        "construction.boq.line",
        "construction_task_boq_line_rel",
        "task_id",
        "boq_line_id",
        string="Bill Items",
        domain="[('project_id', '=', project_id)]",
        help="Bill items this activity delivers.",
    )
    boq_value = fields.Monetary(
        compute="_compute_boq_position", currency_field="currency_id",
        string="Bill Value",
        help="Sell value of the bill items this activity delivers.",
    )
    boq_certified_percent = fields.Float(
        compute="_compute_boq_position", string="Certified %",
        help="Value-weighted share of the linked bill items certified by the "
             "consultant.",
    )
    boq_progress_gap = fields.Float(
        compute="_compute_boq_position", string="Progress Gap %",
        help="Reported progress less certified percentage. Positive means the "
             "programme claims more than has been certified.",
    )
    currency_id = fields.Many2one(
        related="project_id.currency_id", string="Currency")

    @api.depends(
        "progress",
        "boq_line_ids.amount_sell",
        "boq_line_ids.quantity",
        "boq_line_ids.qty_certified",
    )
    def _compute_boq_position(self):
        for task in self:
            lines = task.boq_line_ids
            value = sum(lines.mapped("amount_sell"))
            task.boq_value = value
            # Weight by value: certifying a large item matters more than
            # certifying a small one, so a plain average of line percentages
            # would misreport a mixed activity.
            certified = 0.0
            if value:
                certified = sum(
                    line.amount_sell * (
                        (line.qty_certified / line.quantity) if line.quantity else 0.0
                    )
                    for line in lines
                ) / value * 100.0
            task.boq_certified_percent = certified
            task.boq_progress_gap = (task.progress or 0.0) - certified

    def action_open_boq_lines(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Bill Items"),
            "res_model": "construction.boq.line",
            "view_mode": "list,form",
            "domain": [("id", "in", self.boq_line_ids.ids)],
        }


class ConstructionBoqLineTasks(models.Model):
    """The other side of the link: which activities deliver a bill item."""

    _inherit = "construction.boq.line"

    task_ids = fields.Many2many(
        "project.task",
        "construction_task_boq_line_rel",
        "boq_line_id",
        "task_id",
        string="Programme Activities",
    )
    task_count = fields.Integer(compute="_compute_task_position")
    programme_percent = fields.Float(
        compute="_compute_task_position", string="Programme %",
        help="Average reported progress of the activities delivering this item. "
             "Compare with the certified percentage to see whether measurement "
             "is keeping up with the site.",
    )

    @api.depends("task_ids.progress")
    def _compute_task_position(self):
        for line in self:
            tasks = line.task_ids
            line.task_count = len(tasks)
            line.programme_percent = (
                sum(tasks.mapped("progress")) / len(tasks) if tasks else 0.0
            )

    def action_open_tasks(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Programme Activities"),
            "res_model": "project.task",
            "view_mode": "list,form",
            "domain": [("id", "in", self.task_ids.ids)],
        }
