from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError


class FacilityPmPlan(models.Model):
    """Preventive-maintenance plan that generates maintenance requests either
    on a calendar cycle or when an asset meter crosses an interval."""

    _name = "facility.pm.plan"
    _description = "Preventive Maintenance Plan"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    equipment_id = fields.Many2one(
        "maintenance.equipment", string="Asset", required=True,
        ondelete="cascade")
    maintenance_team_id = fields.Many2one(
        "maintenance.team", string="Team")
    job_plan_id = fields.Many2one("facility.job.plan", string="Job Plan")
    trigger_type = fields.Selection(
        [("calendar", "Calendar"), ("meter", "Meter")],
        default="calendar", required=True)
    # Calendar trigger
    interval_number = fields.Integer(default=3)
    interval_type = fields.Selection(
        [("days", "Days"), ("weeks", "Weeks"), ("months", "Months")],
        default="months")
    next_date = fields.Date(default=fields.Date.context_today)
    # Meter trigger
    meter_id = fields.Many2one(
        "facility.asset.meter", string="Meter",
        domain="[('equipment_id', '=', equipment_id)]")
    meter_interval = fields.Float(
        string="Every (units)", help="Generate a request each time the meter "
        "advances by this many units.")
    last_triggered_value = fields.Float(readonly=True)
    request_count = fields.Integer(compute="_compute_request_count")

    def _compute_request_count(self):
        data = self.env["maintenance.request"]._read_group(
            [("pm_plan_id", "in", self.ids)], ["pm_plan_id"], ["__count"])
        counts = {plan.id: count for plan, count in data}
        for plan in self:
            plan.request_count = counts.get(plan.id, 0)

    def _generate_request(self, note=None):
        self.ensure_one()
        vals = {
            "name": self.env._("%(plan)s — %(asset)s",
                               plan=self.name, asset=self.equipment_id.name),
            "equipment_id": self.equipment_id.id,
            "maintenance_type": "preventive",
            "schedule_date": fields.Datetime.now(),
            "pm_plan_id": self.id,
            "job_plan_id": self.job_plan_id.id,
            "duration": self.job_plan_id.estimated_duration,
        }
        # Only override the team when we have one, otherwise let the core
        # maintenance default (first team) apply — the column is required.
        team = self.maintenance_team_id or self.equipment_id.maintenance_team_id
        if team:
            vals["maintenance_team_id"] = team.id
        return self.env["maintenance.request"].create(vals)

    def action_generate_now(self):
        for plan in self:
            plan._generate_request()
            if plan.trigger_type == "calendar":
                plan._advance_calendar()
            elif plan.meter_id:
                plan.last_triggered_value = plan.meter_id.current_value
        return True

    def _advance_calendar(self):
        self.ensure_one()
        base = self.next_date or fields.Date.context_today(self)
        self.next_date = base + relativedelta(
            **{self.interval_type: self.interval_number})

    def action_view_requests(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Requests — %s", self.name),
            "res_model": "maintenance.request",
            "view_mode": "list,form",
            "domain": [("pm_plan_id", "=", self.id)],
        }

    @api.constrains("trigger_type", "meter_id", "meter_interval")
    def _check_meter(self):
        for plan in self:
            if plan.trigger_type == "meter":
                if not plan.meter_id or plan.meter_interval <= 0:
                    raise UserError(self.env._(
                        "Meter plans need a meter and a positive interval."))

    @api.model
    def _cron_generate_pm(self):
        today = fields.Date.context_today(self)
        # Calendar-based
        for plan in self.search(
                [("trigger_type", "=", "calendar"), ("next_date", "<=", today)]):
            plan._generate_request()
            plan._advance_calendar()
        # Meter-based
        for plan in self.search(
                [("trigger_type", "=", "meter"), ("meter_id", "!=", False)]):
            current = plan.meter_id.current_value
            if current >= plan.last_triggered_value + plan.meter_interval:
                plan._generate_request(
                    note=self.env._("Meter at %s", current))
                plan.last_triggered_value = current
        return True
