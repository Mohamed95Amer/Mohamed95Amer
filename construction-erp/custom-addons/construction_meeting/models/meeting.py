from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionMeeting(models.Model):
    """A site or progress meeting and its minutes.

    The value is not the minutes, it is the actions. On most jobs an action
    raised in one meeting is retyped into the next set of minutes, and the ones
    that quietly stop being retyped are exactly the ones nobody did. Here an
    open action is carried into the next meeting of the same series
    automatically and keeps its original meeting and number, so its age is
    visible rather than reset each time it moves.
    """

    _name = "construction.meeting"
    _description = "Construction Meeting"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "MOM"
    _order = "meeting_date desc, id desc"

    meeting_type = fields.Selection(
        [
            ("progress", "Progress Meeting"),
            ("site", "Site Meeting"),
            ("technical", "Technical / Coordination"),
            ("hse", "HSE Meeting"),
            ("client", "Client Meeting"),
            ("other", "Other"),
        ],
        default="progress", required=True, tracking=True,
    )
    series = fields.Char(
        help="Meetings sharing a series carry their open actions forward, "
             "e.g. 'Weekly Progress'.",
    )
    meeting_date = fields.Datetime(
        required=True, default=fields.Datetime.now, tracking=True)
    location = fields.Char()
    chaired_by_id = fields.Many2one(
        "res.users", string="Chaired By", default=lambda self: self.env.user)
    minutes = fields.Html(string="Discussion")
    state = fields.Selection(
        [("draft", "Draft"), ("issued", "Minutes Issued"), ("closed", "Closed")],
        default="draft", tracking=True, group_expand="_group_expand_state",
    )
    attendee_ids = fields.One2many(
        "construction.meeting.attendee", "meeting_id", copy=False)
    action_ids = fields.One2many(
        "construction.meeting.action", "meeting_id", copy=False)
    previous_meeting_id = fields.Many2one(
        "construction.meeting", readonly=True, copy=False,
        help="Meeting whose open actions were carried into this one.")

    attendee_count = fields.Integer(compute="_compute_counts", store=True)
    open_action_count = fields.Integer(compute="_compute_counts", store=True)
    overdue_action_count = fields.Integer(compute="_compute_counts", store=True)

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("attendee_ids", "action_ids.state", "action_ids.deadline")
    def _compute_counts(self):
        today = fields.Date.context_today(self)
        for meeting in self:
            meeting.attendee_count = len(meeting.attendee_ids)
            open_actions = meeting.action_ids.filtered(
                lambda a: a.state != "closed")
            meeting.open_action_count = len(open_actions)
            meeting.overdue_action_count = len(open_actions.filtered(
                lambda a: a.deadline and a.deadline < today))

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state != "closed"

    def action_view_open_actions(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Open Actions — %s", self.reference),
            "res_model": "construction.meeting.action",
            "view_mode": "list,form",
            "domain": [("meeting_id", "=", self.id), ("state", "!=", "closed")],
        }

    def action_view_overdue_actions(self):
        self.ensure_one()
        today = fields.Date.context_today(self)
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Overdue Actions — %s", self.reference),
            "res_model": "construction.meeting.action",
            "view_mode": "list,form",
            "domain": [
                ("meeting_id", "=", self.id), ("state", "!=", "closed"),
                ("deadline", "!=", False), ("deadline", "<", today),
            ],
        }

    def action_issue(self):
        for meeting in self:
            if meeting.state != "draft":
                raise UserError(
                    self.env._("Only draft minutes can be issued.")
                )
            meeting.state = "issued"

    def action_close(self):
        self.filtered(lambda m: m.state == "issued").state = "closed"

    def action_reset(self):
        self.filtered(lambda m: m.state != "draft").state = "draft"

    def action_next_meeting(self):
        """Open the next meeting in this series, carrying open actions over."""
        self.ensure_one()
        successor = self.copy({
            "meeting_date": fields.Datetime.now(),
            "state": "draft",
            "minutes": False,
            "previous_meeting_id": self.id,
            "attendee_ids": [
                (0, 0, {"partner_id": a.partner_id.id, "name": a.name,
                        "organisation": a.organisation, "present": False})
                for a in self.attendee_ids
            ],
        })
        carried = self.action_ids.filtered(lambda a: a.state != "closed")
        for action in carried:
            action.copy({
                "meeting_id": successor.id,
                # Keep the origin so the action's real age survives the move —
                # an item reopened at every meeting must not look new.
                "origin_meeting_id": action.origin_meeting_id.id or self.id,
                "carried_count": action.carried_count + 1,
            })
        successor.message_post(body=self.env._(
            "%s open action(s) carried forward from %s.",
            len(carried), self.reference or self.name,
        ))
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.meeting",
            "res_id": successor.id,
            "view_mode": "form",
        }


class ConstructionMeetingAttendee(models.Model):
    _name = "construction.meeting.attendee"
    _description = "Meeting Attendee"
    _order = "organisation, name"

    meeting_id = fields.Many2one(
        "construction.meeting", required=True, ondelete="cascade")
    partner_id = fields.Many2one("res.partner", string="Contact")
    name = fields.Char(required=True)
    organisation = fields.Char()
    present = fields.Boolean(default=True)
    apologies = fields.Boolean(help="Sent apologies rather than attending.")

    @api.onchange("partner_id")
    def _onchange_partner_id(self):
        for attendee in self:
            if attendee.partner_id:
                attendee.name = attendee.partner_id.name
                attendee.organisation = (
                    attendee.partner_id.parent_id.name
                    or attendee.partner_id.company_name
                )


class ConstructionMeetingAction(models.Model):
    """An action item. Carried forward until someone closes it."""

    _name = "construction.meeting.action"
    _description = "Meeting Action Item"
    _order = "deadline, id"

    meeting_id = fields.Many2one(
        "construction.meeting", required=True, ondelete="cascade", index=True)
    project_id = fields.Many2one(
        related="meeting_id.project_id", store=True, index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Action", required=True)
    description = fields.Text()
    owner_id = fields.Many2one("res.users", string="Owner")
    owner_partner_id = fields.Many2one(
        "res.partner", string="External Owner",
        help="Use when the action sits with a subcontractor or consultant "
             "rather than an internal user.")
    deadline = fields.Date()
    state = fields.Selection(
        [("open", "Open"), ("in_progress", "In Progress"),
         ("closed", "Closed")],
        default="open", required=True,
    )
    closed_date = fields.Date(readonly=True)
    origin_meeting_id = fields.Many2one(
        "construction.meeting", string="First Raised At", readonly=True,
        help="Meeting the action was first raised at. Preserved when it is "
             "carried forward so its true age stays visible.")
    carried_count = fields.Integer(
        string="Times Carried", readonly=True,
        help="How many meetings this action has been carried through. A high "
             "number is the signal — it is the item nobody is doing.")
    is_overdue = fields.Boolean(compute="_compute_is_overdue", search="_search_is_overdue")

    @api.depends("deadline", "state")
    def _compute_is_overdue(self):
        today = fields.Date.context_today(self)
        for action in self:
            action.is_overdue = bool(
                action.deadline and action.state != "closed"
                and action.deadline < today
            )

    def _search_is_overdue(self, operator, value):
        today = fields.Date.context_today(self)
        domain = [("deadline", "<", today), ("state", "!=", "closed")]
        if (operator == "=" and value) or (operator == "!=" and not value):
            return domain
        return ["!"] + domain

    def write(self, vals):
        if vals.get("state") == "closed":
            vals.setdefault("closed_date", fields.Date.context_today(self))
        elif "state" in vals and vals["state"] != "closed":
            vals["closed_date"] = False
        return super().write(vals)
