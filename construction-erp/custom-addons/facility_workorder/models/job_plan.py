from odoo import fields, models


class FacilityJobPlan(models.Model):
    _name = "facility.job.plan"
    _description = "Maintenance Job Plan"

    name = fields.Char(required=True)
    description = fields.Text()
    estimated_duration = fields.Float(
        string="Estimated Duration (h)",
        help="Default labour hours for requests generated from this plan.")
    task_ids = fields.One2many("facility.job.plan.task", "job_plan_id")
    active = fields.Boolean(default=True)


class FacilityJobPlanTask(models.Model):
    _name = "facility.job.plan.task"
    _description = "Job Plan Task"
    _order = "job_plan_id, sequence, id"

    job_plan_id = fields.Many2one(
        "facility.job.plan", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Step", required=True)
