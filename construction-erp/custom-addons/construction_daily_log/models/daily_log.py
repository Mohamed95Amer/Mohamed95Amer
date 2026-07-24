from odoo import api, fields, models


class ConstructionDailyLog(models.Model):
    _name = "construction.daily.log"
    _description = "Daily Site Log"
    _inherit = ["mail.thread"]
    _order = "log_date desc, id desc"
    _rec_name = "display_name"

    project_id = fields.Many2one(
        "project.project", required=True, ondelete="cascade",
        domain=[("is_construction", "=", True)], index=True)
    company_id = fields.Many2one(
        "res.company", related="project_id.company_id", store=True)
    log_date = fields.Date(
        required=True, default=fields.Date.context_today, string="Date")
    display_name = fields.Char(compute="_compute_display_name", store=True)
    weather = fields.Selection(
        [("sunny", "Sunny"), ("cloudy", "Cloudy"), ("rain", "Rain"),
         ("storm", "Storm"), ("hot", "Hot"), ("windy", "Windy")],
        default="sunny")
    temperature = fields.Float(string="Temp (°C)")
    prepared_by_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, string="Prepared By")
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("approved", "Approved")],
        default="draft", tracking=True)
    notes = fields.Text()

    manpower_ids = fields.One2many(
        "construction.daily.log.manpower", "log_id")
    equipment_ids = fields.One2many(
        "construction.daily.log.equipment", "log_id")
    activity_ids = fields.One2many(
        "construction.daily.log.activity", "log_id")
    delay_ids = fields.One2many("construction.daily.log.delay", "log_id")

    total_headcount = fields.Integer(compute="_compute_totals", store=True)
    total_labour_hours = fields.Float(compute="_compute_totals", store=True)
    total_delay_hours = fields.Float(compute="_compute_totals", store=True)

    _sql_constraints = [
        ("log_uniq", "unique(project_id, log_date)",
         "A daily log already exists for this project and date."),
    ]

    @api.depends("project_id", "log_date")
    def _compute_display_name(self):
        for log in self:
            log.display_name = (
                f"{log.project_id.name or ''} — {log.log_date or ''}"
            )

    @api.depends("manpower_ids.headcount", "manpower_ids.hours",
                 "delay_ids.hours_lost")
    def _compute_totals(self):
        for log in self:
            log.total_headcount = sum(log.manpower_ids.mapped("headcount"))
            log.total_labour_hours = sum(
                m.headcount * m.hours for m in log.manpower_ids)
            log.total_delay_hours = sum(log.delay_ids.mapped("hours_lost"))

    def action_submit(self):
        self.filtered(lambda l: l.state == "draft").state = "submitted"

    def action_approve(self):
        self.filtered(lambda l: l.state == "submitted").state = "approved"

    def action_reset(self):
        self.state = "draft"


class ConstructionDailyLogManpower(models.Model):
    _name = "construction.daily.log.manpower"
    _description = "Daily Log — Manpower"

    log_id = fields.Many2one(
        "construction.daily.log", required=True, ondelete="cascade")
    trade = fields.Char(required=True, help="e.g. Steel fixers, Carpenters.")
    contractor_id = fields.Many2one("res.partner", string="Contractor")
    headcount = fields.Integer(default=1)
    hours = fields.Float(default=8.0, string="Hours / person")


class ConstructionDailyLogEquipment(models.Model):
    _name = "construction.daily.log.equipment"
    _description = "Daily Log — Equipment"

    log_id = fields.Many2one(
        "construction.daily.log", required=True, ondelete="cascade")
    name = fields.Char(required=True, help="e.g. Tower crane, Excavator.")
    quantity = fields.Integer(default=1)
    hours = fields.Float(default=8.0, string="Operating Hours")


class ConstructionDailyLogActivity(models.Model):
    _name = "construction.daily.log.activity"
    _description = "Daily Log — Work Activity"

    log_id = fields.Many2one(
        "construction.daily.log", required=True, ondelete="cascade")
    description = fields.Char(required=True)
    location = fields.Char()
    boq_line_id = fields.Many2one(
        "construction.boq.line", string="BOQ Item",
        domain="[('project_id', '=', parent.project_id)]")


class ConstructionDailyLogDelay(models.Model):
    _name = "construction.daily.log.delay"
    _description = "Daily Log — Delay / Disruption"

    log_id = fields.Many2one(
        "construction.daily.log", required=True, ondelete="cascade")
    cause = fields.Char(required=True)
    category = fields.Selection(
        [("weather", "Weather"), ("material", "Material"), ("labour", "Labour"),
         ("design", "Design / Info"), ("access", "Access"), ("other", "Other")],
        default="other")
    hours_lost = fields.Float()
