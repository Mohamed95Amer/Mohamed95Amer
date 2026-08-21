"""Where a lead came from, recorded as data and checked on the way in.

Majal is built by somebody who also works at Odoo. Those are two lead pools
that must never mix, and "I'll be careful" is not a control — it is an
intention that survives until the first busy week. So provenance is a required
field on every lead this pipeline manages, and a handful of codes naming the
day job are refused outright at the point a source is created.

What this does and does not do, stated plainly because the difference matters.
It cannot detect that a company name was remembered from a support ticket; no
constraint can read a mind. What it does is make every lead's origin an
explicit, auditable value rather than an assumption, refuse the obvious
mislabelling, and give an auditor one query that answers "where did this list
come from" for all of it. That is the honest limit of a schema control, and it
is still worth far more than a note in a README.
"""

from odoo import api, fields, models
from odoo.exceptions import ValidationError

# Codes that name the employer's systems. Refused as a source code, and
# refused as a source *name* too — renaming around the check is exactly what a
# hurried person does, and the check is worth nothing if it only inspects the
# field nobody looks at.
DENIED_CODES = frozenset({
    "odoo_crm",
    "odoo_upsell",
    "odoo_churn",
    "odoo_internal",
    "odoo_subscription",
    "odoo_partner_portal",
    "employer_crm",
})

# Substrings that, in a source's code or name, mean the day job. Kept separate
# from DENIED_CODES so the exact-match list stays readable.
DENIED_SUBSTRINGS = ("odoo_crm", "odoo-crm", "odoo customer", "odoo account",
                     "odoo subscription", "odoo upsell", "odoo churn")


def is_denied(code, name=""):
    """True when this source names the employer rather than Majal's own work."""
    haystack = "%s %s" % (code or "", name or "")
    haystack = haystack.strip().lower()
    if (code or "").strip().lower() in DENIED_CODES:
        return True
    return any(token in haystack for token in DENIED_SUBSTRINGS)


class MajalLeadSource(models.Model):
    _name = "majal.lead.source"
    _description = "Majal Lead Source"
    _order = "name"

    name = fields.Char(required=True, translate=True)
    code = fields.Char(
        required=True,
        help="Stable identifier used by the importer and the agents. Lower "
             "case, no spaces.")
    kind = fields.Selection(
        [
            ("own_research", "Own research"),
            ("public_registry", "Public registry"),
            ("referral", "Referral"),
            ("inbound", "Inbound — website or social"),
            ("event", "Event or exhibition"),
            ("partner", "Partner"),
        ],
        required=True,
        default="own_research",
    )
    active = fields.Boolean(default=True)
    notes = fields.Text(
        help="How this list was assembled, in enough detail that somebody "
             "else could repeat it or challenge it.")
    lead_count = fields.Integer(compute="_compute_lead_count")

    _sql_constraints = [
        ("code_unique", "unique(code)",
         "A source code has to be unique — it is what the importer matches on."),
    ]

    def _compute_lead_count(self):
        counts = dict(self.env["crm.lead"]._read_group(
            [("majal_source_id", "in", self.ids)],
            groupby=["majal_source_id"],
            aggregates=["__count"],
        ))
        for source in self:
            source.lead_count = counts.get(source, 0)

    @api.constrains("code", "name")
    def _check_not_employer_provenance(self):
        """Refuse a source that names the employer's systems.

        Deliberately a constraint rather than a filter on create: a constraint
        also fires on write, so a permitted source cannot be quietly renamed
        into a forbidden one after the fact.
        """
        for source in self:
            if is_denied(source.code, source.name):
                raise ValidationError(self.env._(
                    "“%s” names an employer system. Majal's pipeline and the "
                    "day job are kept separate, so this cannot be a lead "
                    "source. If these contacts were met independently of that "
                    "work, record the source that is actually true — a "
                    "registry, an event, a referral.",
                    source.name or source.code,
                ))

    @api.model
    def _get_by_code(self, code):
        """Look a source up for the importer, failing loudly if it is unknown.

        An importer that silently invented missing sources would defeat the
        whole point: the value has to be one somebody chose on purpose.
        """
        source = self.search([("code", "=", code)], limit=1)
        if not source:
            raise ValidationError(self.env._(
                "No lead source with code “%s”. Create it first, describing "
                "how the list was assembled.", code))
        return source
