"""Who signs what, as data rather than as code.

Every approval in this suite used to be a state field and a button with a
`groups` attribute on it. That has two problems, and the second is the serious
one: a threshold cannot be expressed at all — a variation of five thousand and
one of five million took the same single click — and the `groups` attribute is
a UI instruction, so the rule vanished the moment anything called the method
directly.

A rule is matched on the document's model, its kind and the value it carries.
The result is a chain of steps, each with somebody who has to say yes. Changing
who signs for a quarter of a million is then an afternoon's data entry by a
commercial manager rather than a release.
"""

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ConstructionApprovalRule(models.Model):
    _name = "construction.approval.rule"
    _description = "Approval Rule"
    _order = "model_id, sequence, amount_from"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(
        default=10, help="Order in which rules are tried. The first match wins.")
    company_id = fields.Many2one(
        "res.company", default=lambda self: self.env.company)

    model_id = fields.Many2one(
        "ir.model", string="Applies To", required=True, ondelete="cascade",
        domain=[("transient", "=", False)])
    model_name = fields.Char(related="model_id.model", store=True, index=True)
    document_kind = fields.Char(
        help="Optional narrowing within a model — an 'addition' variation and "
             "an 'omission' need not go to the same people. Left empty, the "
             "rule covers every kind.")
    project_id = fields.Many2one(
        "project.project", domain=[("is_construction", "=", True)],
        help="Leave empty to apply to every project. A job with an unusual "
             "delegation of authority gets its own rules without disturbing "
             "the others.")

    # Value bands. Inclusive of `amount_from`, exclusive of `amount_to`, so
    # bands written 0–50k and 50k–250k meet exactly once at fifty thousand.
    amount_from = fields.Monetary(default=0.0)
    amount_to = fields.Monetary(
        help="Leave at zero for no upper limit — the top band.")
    currency_id = fields.Many2one(
        "res.currency", default=lambda self: self.env.company.currency_id)

    step_ids = fields.One2many(
        "construction.approval.rule.step", "rule_id", required=True, copy=True)
    require_other_user = fields.Boolean(
        string="Not the Author", default=True,
        help="The person who raised or last edited the document cannot be the "
             "one who approves it. The control an auditor asks for first.")

    _sql_constraints = [
        ("amount_band", "check(amount_to = 0 or amount_to > amount_from)",
         "The upper limit must be above the lower one, or zero for no limit."),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        """A constraint on a one2many does not fire when the field is simply
        absent from the values, which is exactly how a rule with no steps gets
        created. Checking here catches it."""
        rules = super().create(vals_list)
        rules._check_has_steps()
        return rules

    @api.constrains("step_ids")
    def _check_has_steps(self):
        for rule in self:
            if not rule.step_ids:
                raise ValidationError(self.env._(
                    "A rule with no steps approves nothing. Add at least one "
                    "approver, or archive the rule."))

    def _covers(self, amount):
        """Is this value inside the rule's band?"""
        self.ensure_one()
        if amount < self.amount_from:
            return False
        return not self.amount_to or amount < self.amount_to

    @api.model
    def _match(self, record, amount, kind=False):
        """The rule that governs this document, or an empty set.

        Most specific first: a rule naming the project beats a company-wide
        one, and a rule naming the kind beats a rule covering every kind. No
        match means no approval is required, which is the right default —
        a suite that refused to work until somebody wrote rules would simply
        have the rules written badly and in a hurry.
        """
        candidates = self.search([
            ("model_name", "=", record._name),
            "|", ("project_id", "=", False),
                 ("project_id", "=", record.project_id.id
                  if "project_id" in record._fields else False),
            "|", ("document_kind", "=", False), ("document_kind", "=", kind),
        ])
        matching = candidates.filtered(lambda r: r._covers(amount))
        return matching.sorted(
            key=lambda r: (
                not r.project_id,          # project-specific first
                not r.document_kind,       # kind-specific next
                r.sequence,
            ),
        )[:1]


class ConstructionApprovalRuleStep(models.Model):
    """One signature in a chain."""

    _name = "construction.approval.rule.step"
    _description = "Approval Rule Step"
    _order = "sequence, id"

    rule_id = fields.Many2one(
        "construction.approval.rule", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True, help="What this signature means, e.g. "
                                           "'Commercial review'.")
    group_id = fields.Many2one(
        "res.groups", string="Any Member Of",
        help="Anybody in this group can give this signature.")
    user_id = fields.Many2one(
        "res.users", string="Specific Person",
        help="Use where the authority is personal rather than a role. A group "
             "is usually better: people go on leave, roles do not.")

    @api.model_create_multi
    def create(self, vals_list):
        """Same reason as the rule above: neither field present means the
        constraint never runs, and a step nobody can sign is created."""
        steps = super().create(vals_list)
        steps._check_who()
        return steps

    @api.constrains("group_id", "user_id")
    def _check_who(self):
        for step in self:
            if not step.group_id and not step.user_id:
                raise ValidationError(self.env._(
                    "A step needs somebody who can sign it: a group or a "
                    "person."))
