from odoo import api, fields, models

# LTIFR is conventionally expressed per one million hours worked. Keeping the
# base explicit matters: a number quoted against 200,000 hours (the US OSHA
# convention) is five times smaller and not comparable, and quietly switching
# base is how safety statistics stop meaning anything.
LTIFR_BASE_HOURS = 1_000_000


class ProjectSafety(models.Model):
    """Safety statistics for a construction project.

    Manhours come from the daily site logs that are already being filled in
    (headcount x hours per trade), so LTIFR is computed from the same record
    the site actually keeps rather than from a number typed into a safety
    spreadsheet once a month.
    """

    _inherit = "project.project"

    hse_incident_ids = fields.One2many(
        "construction.incident", "project_id", string="Incidents")
    hse_permit_ids = fields.One2many(
        "construction.permit", "project_id", string="Permits to Work")
    hse_talk_ids = fields.One2many(
        "construction.toolbox.talk", "project_id", string="Toolbox Talks")
    hse_daily_log_ids = fields.One2many(
        "construction.daily.log", "project_id", string="Daily Logs")

    hse_manhours = fields.Float(
        compute="_compute_safety_stats", string="Manhours Worked",
        help="Total labour hours recorded on the project's daily site logs.",
    )
    hse_incident_count = fields.Integer(
        compute="_compute_safety_stats", string="Incidents")
    hse_near_miss_count = fields.Integer(
        compute="_compute_safety_stats", string="Near Misses")
    hse_lti_count = fields.Integer(
        compute="_compute_safety_stats", string="Lost Time Injuries")
    hse_days_lost = fields.Integer(
        compute="_compute_safety_stats", string="Days Lost")
    hse_ltifr = fields.Float(
        compute="_compute_safety_stats", string="LTIFR",
        help="Lost Time Injury Frequency Rate: lost-time injuries per one "
             "million hours worked.",
    )
    hse_days_since_lti = fields.Integer(
        compute="_compute_safety_stats", string="Days Since Last LTI",
        help="-1 when the project has never recorded a lost-time injury.",
    )
    hse_live_permit_count = fields.Integer(
        compute="_compute_safety_stats", string="Live Permits")
    hse_open_action_count = fields.Integer(
        compute="_compute_safety_stats", string="Open Safety Actions")

    @api.depends(
        "hse_incident_ids.incident_class",
        "hse_incident_ids.is_lti",
        "hse_incident_ids.occurred_on",
        "hse_incident_ids.days_lost",
        "hse_incident_ids.action_ids.done",
        "hse_permit_ids.state",
        "hse_permit_ids.valid_from",
        "hse_permit_ids.valid_to",
        "hse_daily_log_ids.total_labour_hours",
    )
    def _compute_safety_stats(self):
        today = fields.Date.context_today(self)
        for project in self:
            incidents = project.hse_incident_ids
            ltis = incidents.filtered("is_lti")
            manhours = sum(project.hse_daily_log_ids.mapped("total_labour_hours"))

            project.hse_manhours = manhours
            project.hse_incident_count = len(incidents)
            project.hse_near_miss_count = len(
                incidents.filtered(lambda i: i.incident_class == "near_miss")
            )
            project.hse_lti_count = len(ltis)
            project.hse_days_lost = sum(ltis.mapped("days_lost"))
            project.hse_ltifr = (
                (len(ltis) * LTIFR_BASE_HOURS / manhours) if manhours else 0.0
            )

            last_lti = max(ltis.mapped("occurred_on"), default=False)
            # Both sides in the reader's timezone. `today` is already local,
            # and taking .date() off a UTC datetime put the two a day apart for
            # anyone east of Greenwich — which on a Gulf job is everybody, and
            # showed up as a safety board reading one day out every evening.
            project.hse_days_since_lti = (
                (today - fields.Datetime.context_timestamp(
                    project, last_lti).date()).days
                if last_lti else -1
            )
            project.hse_live_permit_count = len(
                project.hse_permit_ids.filtered("is_live")
            )
            project.hse_open_action_count = len(
                incidents.mapped("action_ids").filtered(lambda a: not a.done)
            )

    def action_open_hse_incidents(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Incidents"),
            "res_model": "construction.incident",
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.id)],
            "context": {"default_project_id": self.id},
        }

    def action_open_hse_permits(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Permits to Work"),
            "res_model": "construction.permit",
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.id)],
            "context": {"default_project_id": self.id},
        }
