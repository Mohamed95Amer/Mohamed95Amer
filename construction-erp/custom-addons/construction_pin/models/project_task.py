from odoo import fields, models


class ProjectTask(models.Model):
    _inherit = "project.task"

    pin_ids = fields.One2many("construction.pin", "task_id")
    pin_count = fields.Integer(compute="_compute_pin_count")

    def _compute_pin_count(self):
        for task in self:
            task.pin_count = len(task.pin_ids)
