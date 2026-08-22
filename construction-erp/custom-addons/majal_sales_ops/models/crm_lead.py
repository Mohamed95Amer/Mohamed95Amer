"""What Majal's own pipeline needs a lead to carry.

Three additions to the stock lead. Provenance, because the pipeline and the
day job must stay apart and the previous section explains why. A score, so
that two thousand rows arrive already ordered and the morning is spent on the
top of the list rather than on deciding what the top of the list is. And a
sequence pointer, so an unanswered lead comes back on its own instead of
relying on somebody remembering it.

The scoring is opinionated and says so. It is tuned for small and medium
contractors in the UAE, Saudi Arabia and Egypt, which means a 4,000-person
international contractor scores *below* a 60-person one. That is not a bug to
be fixed later: the large firm has a procurement process measured in quarters
and an incumbent system, and chasing it with a one-person sales operation is
how a quarter disappears.
"""

from odoo import api, fields, models
from odoo.exceptions import ValidationError

from . import normalise

# Each band's contribution to the 0–100 score. Kept as plain data at module
# level rather than buried in the compute so that the rubric can be read,
# argued with and changed without reading the code around it — the Analyst
# agent proposes changes here weekly.
COUNTRY_POINTS = {"AE": 30, "SA": 30, "EG": 30}

SEGMENT_POINTS = {
    "contractor": 25,
    "developer": 20,
    "subcontractor": 15,
    "consultant": 12,
    "fm": 10,
    # Authorities are genuine buyers — a municipality runs its own project and
    # facilities teams — but they buy through tenders on a timescale a
    # one-person sales operation cannot fund. Scored for what it costs to
    # chase them, not for whether the product fits.
    "government": 5,
    "other": 0,
}

# The SMB shape this product is being sold into. "large" scoring below "small"
# is deliberate — see the module docstring.
SIZE_POINTS = {"micro": 10, "small": 25, "medium": 25, "large": 12, False: 0}

ROLE_POINTS = {
    "owner": 20,
    "commercial": 18,
    "project": 12,
    "it": 5,
    "other": 3,
    False: 0,
}


class CrmLead(models.Model):
    _inherit = "crm.lead"

    majal_managed = fields.Boolean(
        string="Majal Pipeline",
        index=True,
        help="This lead belongs to Majal's own sales pipeline. Everything the "
             "sales agents read and write is filtered on this flag, so an "
             "unrelated CRM record is never touched.",
    )
    majal_source_id = fields.Many2one(
        "majal.lead.source",
        string="Lead Source",
        ondelete="restrict",
        index=True,
        tracking=True,
    )
    majal_country_code = fields.Char(
        compute="_compute_majal_country_code", store=True, index=True,
        string="Market",
    )
    majal_segment = fields.Selection(
        [
            ("contractor", "Main contractor"),
            ("subcontractor", "Subcontractor"),
            ("developer", "Developer"),
            ("consultant", "Consultant"),
            ("fm", "Facilities management"),
            ("government", "Government / authority"),
            ("other", "Other"),
        ],
        default="contractor",
        tracking=True,
    )
    majal_size_band = fields.Selection(
        [
            ("micro", "Under 20 staff"),
            ("small", "20–99 staff"),
            ("medium", "100–499 staff"),
            ("large", "500+ staff"),
        ],
        string="Size",
    )
    majal_role_class = fields.Selection(
        [
            ("owner", "Owner / MD"),
            ("commercial", "Commercial / QS"),
            ("project", "Project director / PM"),
            ("it", "IT"),
            ("other", "Other"),
        ],
        string="Contact Role",
    )
    majal_lang = fields.Selection(
        [("ar", "Arabic"), ("en", "English")],
        default="ar",
        string="Outreach Language",
    )

    majal_icp_score = fields.Integer(
        compute="_compute_majal_icp", store=True, index=True, string="ICP Score",
    )
    majal_icp_tier = fields.Selection(
        [("a", "A"), ("b", "B"), ("c", "C"), ("d", "D")],
        compute="_compute_majal_icp", store=True, string="Tier",
    )

    majal_phone_e164 = fields.Char(
        compute="_compute_majal_keys", store=True, string="Phone (E.164)",
    )
    majal_domain = fields.Char(
        compute="_compute_majal_keys", store=True, index=True,
    )
    majal_dedup_key = fields.Char(
        compute="_compute_majal_keys", store=True, index=True,
        help="Strongest available identity for this row. Two leads sharing "
             "one are the same company.",
    )

    majal_sequence_id = fields.Many2one("majal.sales.sequence", string="Sequence")
    majal_sequence_step = fields.Integer(default=0, string="Step")
    majal_next_action_date = fields.Date(index=True, string="Next Touch")
    majal_sequence_state = fields.Selection(
        [
            ("running", "Running"),
            ("paused", "Paused"),
            ("replied", "Replied"),
            ("done", "Finished"),
            # Terminal, and the only state this module will not leave on its
            # own. "paused" is a decision we made about a lead; "opted_out" is
            # a decision the lead made about us, and the difference has to
            # survive every later bulk action.
            ("opted_out", "Opted Out"),
        ],
        default="running",
        index=True,
        # A duplicated lead starts its own life. Without this a copy of an
        # opted-out record would arrive already terminal — the flag beside it
        # does not copy, so the two would disagree and the lead would sit in
        # the pipeline never being touched and never showing why.
        copy=False,
    )

    majal_opted_out = fields.Boolean(
        string="Opted Out", index=True, copy=False, readonly=True,
        help="Set when the recipient asked to stop hearing from us. Nothing "
             "in this module will email a lead carrying this flag.")
    majal_opt_out_date = fields.Datetime(
        string="Opted Out On", readonly=True, copy=False)
    majal_opt_out_source = fields.Char(
        string="Opt-out Route", readonly=True, copy=False,
        help="How the request arrived — the unsubscribe link, a reply, or a "
             "person recording it by hand.")
    majal_outreach_ids = fields.One2many(
        "majal.outreach", "lead_id", string="Outreach",
    )

    # ------------------------------------------------------------------
    # Derived values
    # ------------------------------------------------------------------
    @api.depends("country_id")
    def _compute_majal_country_code(self):
        for lead in self:
            lead.majal_country_code = (lead.country_id.code or "").upper() or False

    @api.depends("majal_country_code", "majal_segment", "majal_size_band",
                 "majal_role_class")
    def _compute_majal_icp(self):
        for lead in self:
            score = (
                COUNTRY_POINTS.get(lead.majal_country_code, 0)
                + SEGMENT_POINTS.get(lead.majal_segment, 0)
                + SIZE_POINTS.get(lead.majal_size_band, 0)
                + ROLE_POINTS.get(lead.majal_role_class, 0)
            )
            lead.majal_icp_score = score
            if score >= 75:
                lead.majal_icp_tier = "a"
            elif score >= 55:
                lead.majal_icp_tier = "b"
            elif score >= 35:
                lead.majal_icp_tier = "c"
            else:
                lead.majal_icp_tier = "d"

    @api.depends("email_from", "phone", "mobile", "website",
                 "partner_name", "majal_country_code")
    def _compute_majal_keys(self):
        for lead in self:
            country = lead.majal_country_code or None
            phone = normalise.to_e164(
                lead.mobile or lead.phone, country
            ) or False
            domain = (
                normalise.email_domain(lead.email_from)
                or normalise.website_domain(lead.website)
                or False
            )
            lead.majal_phone_e164 = phone
            lead.majal_domain = domain
            kind, value = normalise.dedup_key(
                company=lead.partner_name or lead.name,
                name=lead.contact_name,
                email=lead.email_from,
                phone_e164=phone,
                domain=domain,
            )
            lead.majal_dedup_key = "%s:%s" % (kind, value) if kind else False

    majal_duplicate_count = fields.Integer(
        compute="_compute_majal_duplicate_count",
        string="Possible Duplicates",
        help="Other managed leads that look like the same person — same "
             "address, same mobile, or the same name at the same company. "
             "Colleagues are not duplicates.",
    )

    @api.depends("majal_dedup_key")
    def _compute_majal_duplicate_count(self):
        """How many other rows are probably this same company.

        Not stored: the answer changes whenever any *other* lead is imported,
        and a stored field would be quietly wrong the moment a batch lands.
        Computed per record on read, which is cheap enough for a form and is
        the only place it is shown.
        """
        keys = [lead.majal_dedup_key for lead in self if lead.majal_dedup_key]
        counts = {}
        if keys:
            counts = dict(self._read_group(
                [("majal_dedup_key", "in", keys), ("majal_managed", "=", True)],
                groupby=["majal_dedup_key"],
                aggregates=["__count"],
            ))
        for lead in self:
            total = counts.get(lead.majal_dedup_key, 0)
            lead.majal_duplicate_count = max(total - 1, 0)

    def action_majal_show_duplicates(self):
        """Open the other rows that look like this same company."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Possible duplicates"),
            "res_model": "crm.lead",
            "views": [[False, "list"], [False, "form"]],
            "view_mode": "list,form",
            "domain": [
                ("majal_dedup_key", "=", self.majal_dedup_key),
                ("majal_managed", "=", True),
            ],
        }

    # ------------------------------------------------------------------
    # Provenance
    # ------------------------------------------------------------------
    @api.constrains("majal_managed", "majal_source_id")
    def _check_majal_provenance(self):
        """A managed lead has to say where it came from.

        Enforced on the lead as well as on the source because the two failures
        are different: the source constraint stops a forbidden *list* being
        defined, and this one stops a lead being added to the pipeline with no
        list named at all, which is the easier mistake to make.
        """
        for lead in self:
            if not lead.majal_managed:
                continue
            if not lead.majal_source_id:
                raise ValidationError(self.env._(
                    "“%s” has no lead source. Every lead in Majal's pipeline "
                    "records where it came from — this is what keeps it "
                    "separate from employer data.",
                    lead.display_name,
                ))

    # ------------------------------------------------------------------
    # Replies end the sequence
    # ------------------------------------------------------------------
    def _majal_register_reply(self):
        """A human answered, so stop sending at them.

        The single most damaging thing an outreach sequence does is send step
        four to somebody who answered step three. Odoo already threads an
        inbound mail onto the lead it belongs to, so the reply arrives here on
        its own and the only work left is to stand the sequence down and put
        the lead in front of a person.
        """
        managed = self.filtered(
            lambda lead: lead.majal_managed
            and lead.majal_sequence_state == "running"
        )
        if managed:
            managed.write({
                "majal_sequence_state": "replied",
                "majal_next_action_date": False,
            })
        return managed

    def message_update(self, msg_dict, update_vals=None):
        """Inbound mail on an existing lead — the reply path."""
        result = super().message_update(msg_dict, update_vals=update_vals)
        self._majal_register_reply()
        return result

    # ------------------------------------------------------------------
    # Sequencing
    # ------------------------------------------------------------------
    def majal_start_sequence(self, sequence=None):
        """Put a lead on a sequence and schedule its first touch for today."""
        today = fields.Date.context_today(self)
        for lead in self.filtered(lambda l: not l.majal_opted_out):
            chosen = sequence or lead.majal_sequence_id or self.env[
                "majal.sales.sequence"]._default_for(lead)
            if not chosen:
                continue
            lead.write({
                "majal_sequence_id": chosen.id,
                "majal_sequence_step": 0,
                "majal_sequence_state": "running",
                "majal_next_action_date": today,
            })
        return True

    def majal_opt_out(self, source="unsubscribe-link"):
        """Stop contacting this lead, and withdraw whatever is still queued.

        Flagging the lead alone is not enough. Anything already drafted or
        approved for them is sitting in a queue that a cron will happily send
        tomorrow morning, so the request only actually takes effect if those
        are cancelled in the same breath.

        Deliberately not a delete: the record of having asked is the evidence
        that the request was honoured, and removing the lead would let the
        next import of the same list put them straight back into a sequence.
        """
        pending = self.env["majal.outreach"].sudo().search([
            ("lead_id", "in", self.ids),
            ("state", "in", ("draft", "pending", "approved")),
        ])
        for record in pending:
            record._majal_set_state(
                "rejected",
                failure_reason=self.env._("Recipient opted out."))
        for lead in self:
            if lead.majal_opted_out:
                continue
            lead.sudo().write({
                "majal_opted_out": True,
                "majal_opt_out_date": fields.Datetime.now(),
                "majal_opt_out_source": source,
                "majal_sequence_state": "opted_out",
                "majal_next_action_date": False,
            })
            lead.sudo().message_post(
                body=self.env._(
                    "Opted out of Majal outreach via %(source)s. "
                    "%(count)s queued message(s) withdrawn.",
                    source=source,
                    count=len(pending.filtered(lambda r: r.lead_id == lead))))
        return True

    def action_majal_opt_out(self):
        """Record an opt-out somebody asked for by phone, or in a reply."""
        return self.majal_opt_out(source="recorded-by-hand")

    def action_majal_pause_sequence(self):
        return self.write({
            "majal_sequence_state": "paused",
            "majal_next_action_date": False,
        })

    def action_majal_resume_sequence(self):
        if any(self.mapped("majal_opted_out")):
            raise ValidationError(self.env._(
                "This lead asked not to be contacted. Resuming a sequence "
                "for them is the one thing this pipeline will not do."))
        return self.write({
            "majal_sequence_state": "running",
            "majal_next_action_date": fields.Date.context_today(self),
        })
