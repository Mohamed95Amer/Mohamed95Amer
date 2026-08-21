"""One message to one prospect, drafted by a machine and sent by a decision.

This is the gate the whole pipeline exists around. An agent may compose
anything it likes; nothing reaches a contractor until a person has read it and
said yes. The approval engine already in `construction_base` does that work —
it has a request, a chain, an audit trail and a "waiting for me" inbox that
My Day already draws — so this model inherits it rather than growing a second,
weaker version of the same idea.

Two decisions worth stating.

The rendered body is *stored*, not re-rendered at send time. What a person
approved is exactly what leaves the building; a template edited between
approval and dispatch must not silently change a message somebody already
signed off, and an approved message a person tidied by hand must not have
their edit thrown away.

Dispatch is capped per day and the cap is low on purpose. A new domain that
sends two thousand cold messages is not a sales operation, it is a spam
signal, and the reputation it loses is not recoverable by apologising.
"""

import logging

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.addons.construction_base.models.approval_mixin import (
    WORKFLOW_TRANSITION,
)

_logger = logging.getLogger(__name__)

DAILY_CAP_PARAM = "majal_sales_ops.daily_send_cap"
SENDER_PARAM = "majal_sales_ops.sending_identity"
REPLY_TO_PARAM = "majal_sales_ops.reply_to"
DEFAULT_DAILY_CAP = 30


class MajalOutreach(models.Model):
    _name = "majal.outreach"
    _description = "Majal Outreach Message"
    _inherit = ["construction.approvable", "mail.thread"]
    _order = "id desc"

    name = fields.Char(compute="_compute_name", store=True)
    lead_id = fields.Many2one(
        "crm.lead", required=True, ondelete="cascade", index=True,
        domain=[("majal_managed", "=", True)])
    step_id = fields.Many2one("majal.sales.sequence.step", ondelete="set null")
    channel = fields.Selection(
        [("email", "Email"), ("linkedin", "LinkedIn")],
        required=True, default="email", index=True)
    lang = fields.Selection([("ar", "Arabic"), ("en", "English")], default="ar")

    subject = fields.Char()
    body_html = fields.Html(
        sanitize=True,
        help="What will actually be sent. Edit it freely before approving — "
             "this text is what leaves, not the template it came from.")
    email_to = fields.Char()

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("pending", "Waiting approval"),
            ("approved", "Approved"),
            ("sent", "Sent"),
            ("rejected", "Rejected"),
            ("failed", "Failed"),
        ],
        default="draft", required=True, index=True, tracking=True,
    )
    scheduled_date = fields.Date(default=fields.Date.context_today, index=True)
    sent_date = fields.Datetime(readonly=True)
    failure_reason = fields.Text(readonly=True)
    mail_message_id = fields.Many2one("mail.message", readonly=True)

    @api.depends("lead_id", "channel", "step_id")
    def _compute_name(self):
        for record in self:
            record.name = "%s — %s" % (
                record.lead_id.display_name or "?",
                record.step_id.name or dict(
                    record._fields["channel"].selection).get(record.channel, ""),
            )

    # ------------------------------------------------------------------
    # Approval engine hooks
    # ------------------------------------------------------------------
    def _approval_kind(self):
        """Matched on channel, so email and LinkedIn can diverge later."""
        self.ensure_one()
        return self.channel

    def _approval_amount(self):
        """Outreach carries no money; it is matched on kind alone."""
        return 0.0

    def _on_approval_granted(self, request):
        self._majal_set_state("approved")
        return True

    def _on_approval_refused(self, request, reason):
        self._majal_set_state("rejected")
        return True

    def _majal_set_state(self, state, **extra):
        """The only way this model changes state.

        `construction.approvable` blocks a bare write to `state` — that hole
        was closed deliberately and is documented in the mixin — so every
        transition here passes the private sentinel the mixin checks for.
        """
        values = dict(extra, state=state)
        return self.with_context(
            majal_workflow_transition=WORKFLOW_TRANSITION
        ).write(values)

    # ------------------------------------------------------------------
    # Drafting
    # ------------------------------------------------------------------
    @api.model
    def _draft(self, lead, step):
        """Render a step for a lead and put it in the approval queue."""
        subject, body = self._render_step(lead, step)
        outreach = self.create({
            "lead_id": lead.id,
            "step_id": step.id,
            "channel": step.channel,
            "lang": lead.majal_lang,
            "subject": subject,
            "body_html": body,
            "email_to": lead.email_from if step.channel == "email" else False,
        })
        outreach.action_submit_for_approval()
        return outreach

    @api.model
    def _render_step(self, lead, step):
        """Turn a step's wording into this lead's message."""
        if step.channel == "email" and step.mail_template_id:
            template = step.mail_template_id.with_context(lang=lead.majal_lang)
            bodies = template._render_field(
                "body_html", [lead.id], options={"post_process": True})
            subjects = template._render_field("subject", [lead.id])
            return subjects.get(lead.id), bodies.get(lead.id)

        # A non-email step has no template, only the wording on the step. Render
        # it only when it actually carries a placeholder — running the engine
        # over plain prose buys nothing and gives it a way to fail.
        body = step.body or ""
        if body and ("{{" in body or "t-out" in body):
            body = self.env["mail.render.mixin"]._render_template(
                body, "crm.lead", [lead.id]).get(lead.id, body)
        return step.name, body

    def action_submit_for_approval(self):
        """Move a draft into the queue a person actually looks at."""
        for record in self:
            if record.state != "draft":
                continue
            request = record.action_request_approval()
            # No rule configured means nothing would ever approve this. Rather
            # than leave it invisible in `draft` for ever, say so.
            if not request:
                raise UserError(record.env._(
                    "No approval rule covers Majal outreach, so “%s” has "
                    "nobody to approve it. Check that the module's approval "
                    "rule data installed.", record.display_name))
            record._majal_set_state("pending")
        return True

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------
    @api.model
    def _daily_cap(self):
        param = self.env["ir.config_parameter"].sudo().get_param(
            DAILY_CAP_PARAM, DEFAULT_DAILY_CAP)
        try:
            return max(int(param), 0)
        except (TypeError, ValueError):
            return DEFAULT_DAILY_CAP

    @api.model
    def _sending_identity(self):
        """The address outreach goes out as.

        Not the support mailbox. Cold outreach landing in the queue people use
        for live customer problems buries the problems, and a buyer who
        replies to `support@` about a first contact has been told something
        unflattering about how the company is organised.
        """
        config = self.env["ir.config_parameter"].sudo()
        return config.get_param(SENDER_PARAM) or (
            self.env.company.email or False)

    @api.model
    def _cron_dispatch_approved(self):
        """Send today's approved messages, up to the cap, oldest first."""
        start_of_day = fields.Datetime.to_datetime(
            fields.Date.context_today(self))
        sent_today = self.search_count([
            ("state", "=", "sent"),
            ("sent_date", ">=", start_of_day),
        ])
        remaining = self._daily_cap() - sent_today
        if remaining <= 0:
            return 0
        queue = self.search([
            ("state", "=", "approved"),
            ("channel", "=", "email"),
            ("scheduled_date", "<=", fields.Date.context_today(self)),
        ], order="id asc", limit=remaining)
        return queue._send()

    def _send(self):
        sender = self._sending_identity()
        if not sender:
            raise UserError(self.env._(
                "No sending address is configured. Set the system parameter "
                "“%s” to the address outreach should come from.",
                SENDER_PARAM))
        reply_to = self.env["ir.config_parameter"].sudo().get_param(
            REPLY_TO_PARAM) or sender
        sent = 0
        for record in self:
            if not record.email_to:
                record._majal_set_state(
                    "failed", failure_reason=self.env._("No email address."))
                continue
            try:
                mail = self.env["mail.mail"].sudo().create({
                    "subject": record.subject or "",
                    "body_html": record.body_html or "",
                    "email_from": sender,
                    "reply_to": reply_to,
                    "email_to": record.email_to,
                    # model/res_id are what let Odoo's mail gateway thread the
                    # reply back onto this lead instead of dropping it into a
                    # catchall nobody reads.
                    "model": "crm.lead",
                    "res_id": record.lead_id.id,
                    "auto_delete": False,
                })
                mail.send(raise_exception=True)
                record._majal_set_state(
                    "sent",
                    sent_date=fields.Datetime.now(),
                    mail_message_id=mail.mail_message_id.id,
                )
                sent += 1
            except Exception as error:  # noqa: BLE001 - one bad address only fails itself
                _logger.warning(
                    "Majal outreach %s failed to send: %s", record.id, error)
                record._majal_set_state("failed", failure_reason=str(error))
        return sent

    def action_send_now(self):
        """Send an approved message immediately, ignoring the daily cap.

        For the one reply that cannot wait for tonight's run. It stays an
        explicit button rather than a default because the cap exists to
        protect the domain and should be stepped over knowingly.
        """
        not_approved = self.filtered(lambda r: r.state != "approved")
        if not_approved:
            raise UserError(self.env._(
                "Only approved messages can be sent. %s is not approved.",
                not_approved[0].display_name))
        return self._send()
