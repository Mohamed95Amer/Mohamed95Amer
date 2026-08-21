"""Signals that somebody is interested, and what they are worth.

The pipeline could previously see exactly one thing: a reply. That is the
rarest signal there is. A contractor who opened the features page twice from
an email and never wrote back was invisible, and so was somebody who filled in
the demo form on majalops.com — that went to a mailbox, not to the pipeline.

So this records intent wherever it can be observed, and scores it separately
from fit. The two are not the same question and must not share a number:

    ICP score      should we want them
    interest score do they want us

A 40-point-fit contractor who just asked for a demo outranks a 95-point-fit
one who has never heard of us. Sorting by fit alone gets that backwards every
morning.

Deliberately absent: open tracking. A pixel is unreliable to the point of
dishonesty now — Apple pre-fetches images and Gmail proxies them, so "opened"
means "a machine somewhere fetched a picture". Clicks are recorded instead,
because a click is a person choosing to go somewhere.
"""

import math

from odoo import api, fields, models

# What each signal is worth before decay. The demo request is the strongest
# thing anyone can do short of signing: they went to the site, found the form,
# and asked. A reply is close behind but includes "not interested", which is
# why it is not higher.
SIGNAL_WEIGHT = {
    "demo_request": 45,
    "reply": 40,
    "form_submit": 30,
    "email_click": 15,
    "social": 10,
}

# Interest goes stale. A click three weeks ago is worth half of one today,
# which is roughly how long a contractor's attention survives a site visit.
HALF_LIFE_DAYS = 21.0

# Above this, somebody should be looking at the lead rather than letting the
# sequence carry on talking at them.
WARM_THRESHOLD = 25


class MajalInterestEvent(models.Model):
    _name = "majal.interest.event"
    _description = "Majal Interest Signal"
    _order = "occurred_at desc, id desc"

    lead_id = fields.Many2one(
        "crm.lead", required=True, ondelete="cascade", index=True)
    kind = fields.Selection(
        [
            ("demo_request", "Asked for a demo"),
            ("reply", "Replied"),
            ("form_submit", "Sent the contact form"),
            ("email_click", "Clicked a link in an email"),
            ("social", "Engaged on social"),
        ],
        required=True, index=True,
    )
    occurred_at = fields.Datetime(
        required=True, default=fields.Datetime.now, index=True)
    detail = fields.Char(help="Which link, which post, what they asked for.")
    outreach_id = fields.Many2one("majal.outreach", ondelete="set null")
    weight = fields.Integer(compute="_compute_weight", store=True)

    @api.depends("kind")
    def _compute_weight(self):
        for event in self:
            event.weight = SIGNAL_WEIGHT.get(event.kind, 0)

    @api.model
    def record(self, lead, kind, detail=None, outreach=None):
        """Log a signal and refresh the lead's score immediately.

        Immediate rather than waiting for the nightly recompute: the whole
        value of a demo request is that somebody sees it today.
        """
        event = self.sudo().create({
            "lead_id": lead.id,
            "kind": kind,
            "detail": (detail or "")[:255] or False,
            "outreach_id": outreach.id if outreach else False,
        })
        lead.sudo()._compute_majal_interest()
        return event


class CrmLead(models.Model):
    _inherit = "crm.lead"

    majal_interest_ids = fields.One2many(
        "majal.interest.event", "lead_id", string="Interest Signals")
    majal_interest_score = fields.Integer(
        compute="_compute_majal_interest", store=True, index=True,
        string="Interest",
        help="Demonstrated intent, decayed by age. Separate from ICP score, "
             "which measures fit.")
    majal_last_interest_at = fields.Datetime(
        compute="_compute_majal_interest", store=True)
    majal_engagement = fields.Selection(
        [
            ("cold", "No signal"),
            ("warm", "Showing interest"),
            ("engaged", "In conversation"),
        ],
        compute="_compute_majal_interest", store=True, index=True,
    )

    @api.depends("majal_interest_ids.kind", "majal_interest_ids.occurred_at",
                 "majal_sequence_state")
    def _compute_majal_interest(self):
        now = fields.Datetime.now()
        for lead in self:
            total = 0.0
            latest = False
            for event in lead.majal_interest_ids:
                if not event.occurred_at:
                    continue
                age_days = (now - event.occurred_at).total_seconds() / 86400.0
                # Half-life decay. Clamped at zero so a clock skew cannot
                # inflate a score above its undecayed weight.
                total += event.weight * math.pow(
                    0.5, max(age_days, 0.0) / HALF_LIFE_DAYS)
                if not latest or event.occurred_at > latest:
                    latest = event.occurred_at
            lead.majal_interest_score = min(int(round(total)), 100)
            lead.majal_last_interest_at = latest
            if lead.majal_sequence_state == "replied":
                lead.majal_engagement = "engaged"
            elif lead.majal_interest_score >= WARM_THRESHOLD:
                lead.majal_engagement = "warm"
            else:
                lead.majal_engagement = "cold"

    @api.model
    def _cron_decay_interest(self):
        """Re-score everyone who has ever shown a signal.

        Interest decays with the calendar, so a score computed a fortnight ago
        is wrong today even though nothing about the lead changed. Only leads
        with events are touched — the rest are zero and stay zero.
        """
        leads = self.search([
            ("majal_managed", "=", True),
            ("majal_interest_ids", "!=", False),
        ])
        leads._compute_majal_interest()
        return len(leads)

    def _majal_register_reply(self):
        """A reply is also an interest signal, not only a sequence stop."""
        managed = super()._majal_register_reply()
        for lead in managed:
            self.env["majal.interest.event"].record(lead, "reply")
        return managed
