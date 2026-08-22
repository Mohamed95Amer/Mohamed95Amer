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
import re
import uuid

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

# This module stores a two-letter language on the lead because that is what a
# salesperson thinks in. Odoo does not: `with_context(lang="en")` raises
# UserError("Invalid language code: en") and takes the whole nightly drafting
# run down with it. Mapped here, once, at the boundary.
MAIL_LANG = {"ar": "ar_001", "en": "en_US"}

# Only http(s) links are rewritten for click tracking. A mailto: or tel: is
# not a page visit and routing one through a redirect would break it.
_HREF = re.compile(r'href="(https?://[^"]+)"', re.I)


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
    access_token = fields.Char(
        default=lambda self: uuid.uuid4().hex, copy=False, readonly=True,
        help="Identifies this message in a tracked click URL. Random rather "
             "than the id, so a click URL cannot be guessed or enumerated.")
    link_ids = fields.One2many("majal.outreach.link", "outreach_id")

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
    def _installed_lang(self, short_code):
        """The Odoo language code for a lead, but only if it is installed.

        Two failures to avoid, not one. A bare "en" is not a language code and
        raises. And a mapped code for a language nobody installed would raise
        just as loudly — so an instance without Arabic renders the Arabic
        template in the default language rather than failing every draft.
        Returns False when there is nothing safe to set.
        """
        code = MAIL_LANG.get(short_code)
        if not code:
            return False
        # res.lang search excludes inactive languages, which is the question
        # being asked: not "does this code exist" but "is it usable here".
        return code if self.env["res.lang"].search_count(
            [("code", "=", code)]) else False

    @api.model
    def _render_step(self, lead, step):
        """Turn a step's wording into this lead's message."""
        if step.channel == "email" and step.mail_template_id:
            template = step.mail_template_id
            lang = self._installed_lang(lead.majal_lang)
            if lang:
                template = template.with_context(lang=lang)
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

        Set it to a full `Name <address>` rather than a bare address. A first
        cold message is read as either "a person wrote to me" or "a system sent
        me something", and the display name does most of that work — which
        matters especially when the mailbox behind it is a role account like
        support@, because the address alone says "system" before the subject
        line is read.

        A dedicated personal mailbox is better still, and on Microsoft 365 it
        does not have to cost anything: an alias on an existing mailbox, or a
        shared mailbox with Send As granted, are both free. Changing this is
        one system parameter whenever that is set up.
        """
        config = self.env["ir.config_parameter"].sudo()
        return config.get_param(SENDER_PARAM) or (
            self.env.company.email or False)

    def _tracked_body(self):
        """Rewrite outgoing links so a click can be seen.

        The click URL carries an index into this message's own stored links,
        never the destination itself. A `?url=` parameter would make the
        endpoint an open redirect on majalops.com — anyone could send a link
        that looks like ours and lands anywhere — and phishing from the domain
        being used for cold outreach is not a trade worth making for simpler
        code.
        """
        self.ensure_one()
        body = self.body_html or ""
        base = self.env["ir.config_parameter"].sudo().get_param("web.base.url")
        if not base:
            return body

        links = []

        def swap(match):
            url = match.group(1)
            links.append(url)
            return 'href="%s/majal/c/%s/%s"' % (
                base.rstrip("/"), self.access_token, len(links) - 1)

        rewritten = _HREF.sub(swap, body)
        if not links:
            return body
        self.link_ids.unlink()
        self.env["majal.outreach.link"].create([
            {"outreach_id": self.id, "index": position, "url": url}
            for position, url in enumerate(links)
        ])
        return rewritten

    def _unsubscribe_url(self):
        self.ensure_one()
        base = self.env["ir.config_parameter"].sudo().get_param(
            "web.base.url") or "https://majalops.com"
        return "%s/majal/unsubscribe/%s" % (base.rstrip("/"), self.access_token)

    def _compliance_footer(self):
        """Who sent this, why it arrived, and how to stop it.

        Appended after the click-tracking rewrite, never before: an unsubscribe
        link routed through the click endpoint would score the person as
        *interested* at the moment they asked to be left alone, and would put a
        redirect between them and the one action they are entitled to take
        without friction.

        This is a cold message to someone who did not ask for it. In the UAE,
        Saudi and Egypt alike, what makes that defensible is that the sender is
        identifiable and the opt-out works on the first click — not the wording
        of the pitch above it.
        """
        self.ensure_one()
        url = self._unsubscribe_url()
        sender = self._sending_identity() or ""
        if (self.lead_id.majal_lang or "ar") == "ar":
            return (
                '<div dir="rtl" style="margin-top:24px;padding-top:12px;'
                'border-top:1px solid #ddd;font-size:12px;color:#666;'
                'text-align:right">'
                '<p style="margin:0 0 6px">وصلتك هذه الرسالة لأننا نعتقد أن '
                '<strong>مجال</strong> قد يفيد فريقك في إدارة المشاريع '
                'والمقاولات. إن لم تكن مهتماً، نعتذر عن الإزعاج.</p>'
                '<p style="margin:0">%s — '
                '<a href="%s" style="color:#666">إلغاء الاشتراك</a>'
                '</p></div>' % (sender, url)
            )
        return (
            '<div style="margin-top:24px;padding-top:12px;'
            'border-top:1px solid #ddd;font-size:12px;color:#666">'
            '<p style="margin:0 0 6px">You are receiving this because we think '
            '<strong>Majal Ops</strong> may be useful to your projects team. '
            'If not, our apologies for the interruption.</p>'
            '<p style="margin:0">%s — '
            '<a href="%s" style="color:#666">Unsubscribe</a>'
            '</p></div>' % (sender, url)
        )

    def _mail_headers(self, reply_to):
        """RFC 8058 one-click unsubscribe.

        Gmail and Outlook both surface a native "unsubscribe" control when
        these two headers are present, and both weigh its absence when deciding
        where bulk mail lands. Stored as a repr because `mail.mail.headers` is
        a Text field that Odoo passes through ast.literal_eval.
        """
        self.ensure_one()
        return repr({
            "List-Unsubscribe": "<%s>, <mailto:%s?subject=unsubscribe>" % (
                self._unsubscribe_url(), reply_to),
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        })

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
            ("lead_id.majal_opted_out", "=", False),
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
            # Checked here too, because action_send_now goes straight to this
            # method without passing the cron's domain. A single unsubscribed
            # address receiving one more message is the whole cost of getting
            # this wrong, so it is worth checking on every path out.
            if record.lead_id.majal_opted_out:
                record._majal_set_state(
                    "rejected",
                    failure_reason=self.env._("Recipient opted out."))
                continue
            try:
                mail = self.env["mail.mail"].sudo().create({
                    "subject": record.subject or "",
                    "body_html": (record._tracked_body()
                                  + record._compliance_footer()),
                    "email_from": sender,
                    "reply_to": reply_to,
                    "headers": record._mail_headers(reply_to),
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


class MajalOutreachLink(models.Model):
    """One link in one sent message, and how often it was clicked.

    Per-message rather than per-template so the Analyst can answer a question
    the aggregate cannot: not "does the features link get clicked" but "who
    clicked it".
    """

    _name = "majal.outreach.link"
    _description = "Majal Outreach Link"
    _order = "outreach_id, index"

    outreach_id = fields.Many2one(
        "majal.outreach", required=True, ondelete="cascade", index=True)
    index = fields.Integer(required=True)
    url = fields.Char(required=True)
    click_count = fields.Integer(default=0, readonly=True)

    _sql_constraints = [
        ("unique_index_per_message", "unique(outreach_id, index)",
         "A message cannot have two links at the same position."),
    ]

    def _register_click(self):
        """Count the click and record the interest it represents."""
        self.ensure_one()
        self.sudo().click_count += 1
        self.env["majal.interest.event"].record(
            self.outreach_id.lead_id, "email_click",
            detail=self.url, outreach=self.outreach_id)
        return self.url
