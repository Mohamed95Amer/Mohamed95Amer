"""The follow-up, written once as data instead of remembered every day.

A sequence is a list of steps, each an offset in days from the first touch and
a channel to reach somebody on. The cron walks leads whose next touch has come
due, drafts that step, and moves the pointer on.

Two things it deliberately does not do. It does not send: every step it
produces is a draft that a person still has to approve, which is the whole
design of this pipeline. And it does not compute dates from a fixed start,
because a run missed while the machine was off would then fire four steps at
once the next morning. Each step is scheduled as an interval from the step
before it, so a gap moves the whole tail back and the prospect still receives
one message at a time.
"""

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class MajalSalesSequence(models.Model):
    _name = "majal.sales.sequence"
    _description = "Majal Outreach Sequence"
    _order = "sequence, id"

    name = fields.Char(required=True, translate=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)
    lang = fields.Selection(
        [("ar", "Arabic"), ("en", "English")], required=True, default="ar",
    )
    country_codes = fields.Char(
        string="Markets",
        help="Comma-separated ISO codes this sequence is written for, e.g. "
             "“AE,SA,EG”. Empty means any market.",
    )
    is_default = fields.Boolean(
        help="Used when no other sequence matches a lead's market and "
             "language.",
    )
    step_ids = fields.One2many("majal.sales.sequence.step", "sequence_id",
                               copy=True)
    step_count = fields.Integer(compute="_compute_step_count")

    @api.depends("step_ids")
    def _compute_step_count(self):
        for record in self:
            record.step_count = len(record.step_ids)

    @api.constrains("step_ids")
    def _check_offsets_ascend(self):
        """Steps have to move forward in time.

        Two steps on the same day means two messages in one morning from a
        company the prospect has never heard of, which is how a domain earns a
        spam reputation.
        """
        for record in self:
            offsets = record.step_ids.sorted("sequence").mapped("day_offset")
            for earlier, later in zip(offsets, offsets[1:]):
                if later <= earlier:
                    raise ValidationError(record.env._(
                        "Each step in “%s” must fall after the one before it. "
                        "Day %s does not follow day %s.",
                        record.name, later, earlier,
                    ))

    @api.model
    def _default_for(self, lead):
        """The sequence written for this lead's market and language."""
        country = (lead.majal_country_code or "").upper()
        candidates = self.search([("lang", "=", lead.majal_lang or "ar")])
        for record in candidates:
            codes = [
                code.strip().upper()
                for code in (record.country_codes or "").split(",")
                if code.strip()
            ]
            if country and codes and country in codes:
                return record
        return candidates.filtered("is_default")[:1] or candidates[:1]

    # ------------------------------------------------------------------
    # The clock
    # ------------------------------------------------------------------
    @api.model
    def _cron_advance_sequences(self):
        """Draft whatever is due today, then schedule what follows.

        Batched and committed per lead by the ORM's normal flush; one lead
        whose template fails to render must not stop the other two hundred, so
        each is tried on its own and a failure only pauses that lead.
        """
        today = fields.Date.context_today(self)
        leads = self.env["crm.lead"].search([
            ("majal_managed", "=", True),
            ("majal_sequence_state", "=", "running"),
            ("majal_next_action_date", "<=", today),
            ("majal_sequence_id", "!=", False),
        ])
        drafted = 0
        for lead in leads:
            try:
                drafted += 1 if lead.majal_sequence_id._advance(lead) else 0
            except Exception:  # noqa: BLE001 - one bad lead must not stop the run
                self.env.cr.rollback()
                lead.sudo().write({"majal_sequence_state": "paused"})
                self.env.cr.commit()
        return drafted

    def _advance(self, lead):
        """Draft the step this lead is due, and point it at the next one."""
        self.ensure_one()
        steps = self.step_ids.sorted("sequence")
        index = lead.majal_sequence_step
        if index >= len(steps):
            lead.write({
                "majal_sequence_state": "done",
                "majal_next_action_date": False,
            })
            return False

        step = steps[index]
        outreach = step._draft_for(lead)

        following = steps[index + 1] if index + 1 < len(steps) else None
        values = {"majal_sequence_step": index + 1}
        if following:
            gap = max(following.day_offset - step.day_offset, 1)
            values["majal_next_action_date"] = fields.Date.add(
                fields.Date.context_today(self), days=gap)
        else:
            values["majal_sequence_state"] = "done"
            values["majal_next_action_date"] = False
        lead.write(values)
        return outreach


class MajalSalesSequenceStep(models.Model):
    _name = "majal.sales.sequence.step"
    _description = "Majal Outreach Sequence Step"
    _order = "sequence, id"

    sequence_id = fields.Many2one(
        "majal.sales.sequence", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True, translate=True)
    day_offset = fields.Integer(
        required=True,
        help="Days after the first touch. The first step is day 0.")
    channel = fields.Selection(
        [
            ("email", "Email"),
            ("linkedin", "LinkedIn"),
        ],
        required=True,
        default="email",
    )
    mail_template_id = fields.Many2one(
        "mail.template",
        domain=[("model", "=", "crm.lead")],
        help="Used for email steps. The body lives in the template so that "
             "wording is versioned data an agent fills in, not text an agent "
             "invents each time.",
    )
    body = fields.Text(
        help="Used for LinkedIn steps, where there is no mail template. "
             "Supports the same {{ object.… }} placeholders.",
    )

    @api.constrains("channel", "mail_template_id")
    def _check_email_has_template(self):
        for step in self:
            if step.channel == "email" and not step.mail_template_id:
                raise ValidationError(step.env._(
                    "Email step “%s” has no template. An email step with no "
                    "wording would draft an empty message.", step.name))

    def _draft_for(self, lead):
        """Produce the approvable draft for this step."""
        self.ensure_one()
        return self.env["majal.outreach"]._draft(lead, self)
