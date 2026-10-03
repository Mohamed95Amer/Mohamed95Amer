from odoo import api, fields, models
from odoo.exceptions import UserError

# Incident classes that count as a Lost Time Injury for statistics. Near
# misses, first aid and medical-treatment cases are recorded but do not stop
# the clock — mixing them into LTIFR is the most common way the number gets
# quietly inflated and stops being comparable with anyone else's.
LTI_CLASSES = ("lost_time", "permanent_disability", "fatality")


class ConstructionIncident(models.Model):
    """Incident, near-miss and dangerous occurrence register.

    Near misses are recorded with the same weight as injuries on purpose: they
    are the free lessons, and a site that only logs blood is one that has
    stopped looking.
    """

    _name = "construction.incident"
    _description = "HSE Incident / Near Miss"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "INC"
    _order = "occurred_on desc, id desc"

    occurred_on = fields.Datetime(
        required=True, default=fields.Datetime.now, tracking=True)
    reported_by_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, tracking=True)
    location = fields.Char()
    contractor_id = fields.Many2one(
        "res.partner", string="Contractor Involved")
    permit_id = fields.Many2one(
        "construction.permit", string="Permit in Force",
        help="Permit the work was being carried out under, if any. A permitted "
             "activity that still produced an incident is a control failure "
             "worth finding.")

    incident_class = fields.Selection(
        [
            ("near_miss", "Near Miss"),
            ("first_aid", "First Aid Case"),
            ("medical", "Medical Treatment Case"),
            ("lost_time", "Lost Time Injury"),
            ("permanent_disability", "Permanent Disability"),
            ("fatality", "Fatality"),
            ("property", "Property Damage"),
            ("environmental", "Environmental"),
        ],
        required=True,
        default="near_miss",
        tracking=True,
    )
    severity = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"),
         ("critical", "Critical")],
        default="low", required=True, tracking=True,
    )
    is_lti = fields.Boolean(
        string="Lost Time Injury", compute="_compute_is_lti", store=True,
        help="Counts towards LTIFR and the days-since-last-LTI clock.",
    )
    days_lost = fields.Integer(
        help="Working days lost. Recorded for lost-time cases.")
    reportable = fields.Boolean(
        string="Reportable to Authority",
        help="Notifiable to the regulator under local law.",
        tracking=True,
    )

    description = fields.Text(string="What Happened", required=True)
    immediate_action = fields.Text(string="Immediate Action Taken")
    root_cause = fields.Text()
    investigator_id = fields.Many2one("res.users", string="Investigator")
    action_ids = fields.One2many(
        "construction.incident.action", "incident_id", copy=False)
    action_progress = fields.Float(compute="_compute_action_progress")
    photo = fields.Image(max_width=1920, max_height=1920)

    state = fields.Selection(
        [
            ("reported", "Reported"),
            ("investigating", "Under Investigation"),
            ("actions", "Actions Outstanding"),
            ("closed", "Closed"),
        ],
        default="reported", tracking=True, group_expand="_group_expand_state",
    )

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("incident_class")
    def _compute_is_lti(self):
        for incident in self:
            incident.is_lti = incident.incident_class in LTI_CLASSES

    @api.depends("action_ids.done")
    def _compute_action_progress(self):
        for incident in self:
            total = len(incident.action_ids)
            done = len(incident.action_ids.filtered("done"))
            incident.action_progress = (done / total * 100) if total else 0.0

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state != "closed"

    def action_investigate(self):
        for incident in self.filtered(lambda i: i.state == "reported"):
            incident.write({
                "state": "investigating",
                "investigator_id": incident.investigator_id.id or self.env.user.id,
            })

    def action_record_actions(self):
        for incident in self:
            if incident.state != "investigating":
                raise UserError(
                    self.env._("Investigate the incident before raising actions.")
                )
            if not incident.root_cause:
                raise UserError(self.env._(
                    "Record the root cause before moving to corrective actions."
                ))
            incident.state = "actions"

    def action_close(self):
        for incident in self:
            if incident.state == "closed":
                continue
            outstanding = incident.action_ids.filtered(lambda a: not a.done)
            if outstanding:
                raise UserError(self.env._(
                    "Close the corrective actions first: %s",
                    ", ".join(outstanding.mapped("name")),
                ))
            if not incident.root_cause:
                raise UserError(
                    self.env._("An incident cannot be closed without a root cause.")
                )
            incident.state = "closed"

    def action_reopen(self):
        self.filtered(lambda i: i.state == "closed").state = "actions"


class ConstructionIncidentAction(models.Model):
    _name = "construction.incident.action"
    _description = "Incident Corrective Action"
    _order = "deadline, id"

    incident_id = fields.Many2one(
        "construction.incident", required=True, ondelete="cascade")
    name = fields.Char(string="Action", required=True)
    responsible_id = fields.Many2one("res.users", string="Owner")
    deadline = fields.Date()
    done = fields.Boolean()
    done_date = fields.Date(readonly=True)

    def write(self, vals):
        if vals.get("done"):
            vals.setdefault("done_date", fields.Date.context_today(self))
        elif "done" in vals and not vals["done"]:
            vals["done_date"] = False
        return super().write(vals)
