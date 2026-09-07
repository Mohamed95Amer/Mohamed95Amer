from odoo import api, fields, models


class MaintenanceRequest(models.Model):
    _inherit = "maintenance.request"

    pm_plan_id = fields.Many2one("facility.pm.plan", readonly=True)
    job_plan_id = fields.Many2one("facility.job.plan", string="Job Plan")
    checklist_ids = fields.One2many(
        "facility.request.task", "request_id", string="Checklist")
    checklist_progress = fields.Float(
        compute="_compute_checklist_progress", string="Checklist %")

    # Costing
    labor_hours = fields.Float()
    labor_rate = fields.Monetary(currency_field="currency_id")
    labor_cost = fields.Monetary(compute="_compute_costs", store=True,
                                 currency_field="currency_id")
    parts_cost = fields.Monetary(currency_field="currency_id")
    contractor_cost = fields.Monetary(currency_field="currency_id")
    total_cost = fields.Monetary(compute="_compute_costs", store=True,
                                 currency_field="currency_id")
    currency_id = fields.Many2one(
        related="company_id.currency_id")

    @api.depends("labor_hours", "labor_rate", "parts_cost", "contractor_cost")
    def _compute_costs(self):
        for req in self:
            req.labor_cost = req.labor_hours * req.labor_rate
            req.total_cost = (req.labor_cost + req.parts_cost
                              + req.contractor_cost)

    @api.depends("checklist_ids.done")
    def _compute_checklist_progress(self):
        for req in self:
            total = len(req.checklist_ids)
            done = len(req.checklist_ids.filtered("done"))
            req.checklist_progress = (done / total * 100) if total else 0.0

    @api.model_create_multi
    def create(self, vals_list):
        requests = super().create(vals_list)
        for req in requests:
            if req.job_plan_id and not req.checklist_ids:
                req._load_checklist_from_job_plan()
        return requests

    def _load_checklist_from_job_plan(self):
        self.ensure_one()
        self.env["facility.request.task"].create([
            {"request_id": self.id, "sequence": task.sequence, "name": task.name}
            for task in self.job_plan_id.task_ids
        ])
        if self.job_plan_id.estimated_duration and not self.labor_hours:
            self.labor_hours = self.job_plan_id.estimated_duration

    def action_load_job_plan(self):
        for req in self.filtered("job_plan_id"):
            req.checklist_ids.unlink()
            req._load_checklist_from_job_plan()


class FacilityRequestTask(models.Model):
    _name = "facility.request.task"
    _description = "Maintenance Request Checklist Item"
    _order = "request_id, sequence, id"

    request_id = fields.Many2one(
        "maintenance.request", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Step", required=True)
    done = fields.Boolean()
