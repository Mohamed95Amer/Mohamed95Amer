from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionRfi(models.Model):
    _name = "construction.rfi"
    _description = "Request for Information"
    _inherit = [
        "construction.document.mixin",
        "mail.thread",
        "mail.activity.mixin",
    ]
    _doc_prefix = "RFI"
    _order = "id desc"

    question = fields.Html(required=True)
    answer = fields.Html(readonly=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("submitted", "Submitted"),
            ("answered", "Answered"),
            ("closed", "Closed"),
        ],
        default="draft",
        tracking=True,
        index=True,
    )
    raised_by_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, readonly=True
    )
    answered_by_id = fields.Many2one("res.users", readonly=True)
    date_submitted = fields.Datetime(readonly=True)
    date_answered = fields.Datetime(readonly=True)
    drawing_revision_ids = fields.Many2many(
        "construction.drawing.revision",
        string="Referenced Drawings",
        domain="[('project_id', '=', project_id)]",
    )
    discipline = fields.Selection(
        [
            ("architectural", "Architectural"),
            ("structural", "Structural"),
            ("mep", "MEP"),
            ("civil", "Civil"),
            ("other", "Other"),
        ],
        default="other",
    )
    cost_impact = fields.Boolean(
        help="The answer may change the contract cost — candidate for a "
        "change event."
    )
    schedule_impact = fields.Boolean(
        help="The answer may affect the programme — candidate for an EOT."
    )
    portal_visible = fields.Boolean(
        string="Visible in Portal",
        default=True,
        help="Show this RFI to portal users (client/consultant/subcontractor).",
    )

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state in ("draft", "submitted")

    def action_submit(self):
        for rfi in self:
            if rfi.state != "draft":
                raise UserError(self.env._("Only draft RFIs can be submitted."))
            if not rfi.ball_in_court_id:
                rfi.ball_in_court_id = rfi.project_id.consultant_id
            rfi.write(
                {"state": "submitted", "date_submitted": fields.Datetime.now()}
            )
            rfi._notify_ball_in_court()

    def action_answer(self):
        """Open composer state: the answer must be filled before calling."""
        for rfi in self:
            if rfi.state != "submitted":
                raise UserError(self.env._("Only submitted RFIs can be answered."))
            if not rfi.answer:
                raise UserError(self.env._("Write the answer before marking as answered."))
            rfi.write(
                {
                    "state": "answered",
                    "date_answered": fields.Datetime.now(),
                    "answered_by_id": self.env.uid,
                    # Ball returns to the raising party to accept/close.
                    "ball_in_court_id": rfi.raised_by_id.partner_id.id,
                }
            )
            rfi._notify_ball_in_court()

    def action_close(self):
        for rfi in self:
            if rfi.state != "answered":
                raise UserError(self.env._("Only answered RFIs can be closed."))
            rfi.state = "closed"

    def action_reopen(self):
        for rfi in self:
            if rfi.state not in ("answered", "closed"):
                raise UserError(self.env._("Only answered/closed RFIs can be reopened."))
            rfi.write({"state": "submitted", "answer": False})
            if rfi.project_id.consultant_id:
                rfi.ball_in_court_id = rfi.project_id.consultant_id
            rfi._notify_ball_in_court()

    def _notify_ball_in_court(self):
        for rfi in self.filtered("ball_in_court_id"):
            rfi.message_subscribe(partner_ids=rfi.ball_in_court_id.ids)
            rfi.message_post(
                body=self.env._(
                    "Ball in court: %s — response required by %s.",
                    rfi.ball_in_court_id.display_name,
                    rfi.date_required or self.env._("(no date set)"),
                ),
                partner_ids=rfi.ball_in_court_id.ids,
            )

    @api.model
    def _cron_overdue_reminders(self):
        overdue = self.search(
            [
                ("state", "=", "submitted"),
                ("date_required", "<", fields.Date.context_today(self)),
            ]
        )
        for rfi in overdue:
            rfi.activity_schedule(
                "mail.mail_activity_data_todo",
                summary=self.env._("Overdue RFI response: %s", rfi.reference),
                user_id=(rfi.project_id.user_id or self.env.user).id,
            )
        return True
