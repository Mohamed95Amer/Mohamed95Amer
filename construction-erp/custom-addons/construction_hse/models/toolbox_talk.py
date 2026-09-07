from odoo import api, fields, models


class ConstructionToolboxTalk(models.Model):
    """Pre-start safety briefing with its attendance record.

    The attendance list is the point: a talk nobody can be shown to have
    attended is not evidence of anything when it is asked for later.
    """

    _name = "construction.toolbox.talk"
    _description = "Toolbox Talk"
    _inherit = ["mail.thread"]
    _order = "talk_date desc, id desc"
    _rec_name = "topic"

    project_id = fields.Many2one(
        "project.project", required=True, ondelete="cascade",
        domain=[("is_construction", "=", True)], index=True)
    company_id = fields.Many2one(
        "res.company", related="project_id.company_id", store=True)
    topic = fields.Char(required=True)
    talk_date = fields.Date(
        required=True, default=fields.Date.context_today, string="Date")
    presenter_id = fields.Many2one(
        "res.users", string="Presented By", default=lambda self: self.env.user)
    contractor_id = fields.Many2one("res.partner", string="Contractor")
    location = fields.Char()
    duration_minutes = fields.Integer(string="Duration (min)", default=15)
    key_points = fields.Text()
    attendee_ids = fields.One2many(
        "construction.toolbox.attendee", "talk_id", copy=False)
    attendee_count = fields.Integer(
        compute="_compute_attendee_count", store=True)

    @api.depends("attendee_ids")
    def _compute_attendee_count(self):
        for talk in self:
            talk.attendee_count = len(talk.attendee_ids)


class ConstructionToolboxAttendee(models.Model):
    _name = "construction.toolbox.attendee"
    _description = "Toolbox Talk Attendee"
    _order = "name"

    talk_id = fields.Many2one(
        "construction.toolbox.talk", required=True, ondelete="cascade")
    name = fields.Char(string="Worker", required=True)
    trade = fields.Char()
    contractor_id = fields.Many2one("res.partner", string="Employer")
    signature = fields.Binary(
        help="Signed on site as the record of attendance.")
