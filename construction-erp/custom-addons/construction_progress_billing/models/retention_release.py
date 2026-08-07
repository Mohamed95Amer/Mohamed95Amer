"""Getting the retention back.

Every interim certificate withholds a percentage and the module had no way to
ever pay it out: `_build_invoice` on the claim says the money "is billed later
through a retention-release certificate", and that certificate did not exist.
On a 25M contract at 5% that is 1.25M sitting in a field with no exit — the
largest commercial hole in the product, and the one a contractor notices first
because it is their money.

Two things matter here and they are different:

* **The dates are contractual.** Half is normally released at taking-over and
  half at the end of the defects liability period, but contracts vary and a
  release can be agreed early. Releasing before the date is flagged, loudly,
  and allowed.
* **The arithmetic is not.** You cannot release money you never held. That is
  blocked outright, because over-releasing is the one error here that loses
  real money and cannot be spotted by eye once there are twenty certificates.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.addons.construction_base.models.approval_mixin import (
    WORKFLOW_TRANSITION,
)


class ConstructionRetentionRelease(models.Model):
    _name = "construction.retention.release"
    _description = "Retention Release Certificate"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin", "construction.approvable"]
    _doc_prefix = "RRC"
    _order = "project_id, date_release desc, id desc"

    name = fields.Char(default=lambda self: self.env._("Retention Release"))
    release_type = fields.Selection(
        [("taking_over", "On Taking-Over"),
         ("dlp_expiry", "On DLP Expiry"),
         ("other", "Other / By Agreement")],
        default="taking_over", required=True, tracking=True,
        help="Which contractual milestone this release is claimed against.",
    )
    date_release = fields.Date(
        string="Release Date", default=fields.Date.context_today,
        required=True, tracking=True)
    currency_id = fields.Many2one(
        related="project_id.currency_id", store=True)
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("approved", "Approved"), ("invoiced", "Invoiced"),
         ("paid", "Paid"), ("cancelled", "Cancelled")],
        default="draft", tracking=True, index=True)
    move_id = fields.Many2one("account.move", readonly=True, copy=False)
    move_payment_state = fields.Selection(
        related="move_id.payment_state", string="Invoice Payment")

    percent = fields.Float(
        string="Release (%)", default=50.0,
        help="Share of the retention still held to release on this "
             "certificate. The amount is computed from it, and can be "
             "overridden where a contract releases an agreed sum instead.",
    )
    amount_withheld = fields.Monetary(
        compute="_compute_position", store=True, recursive=True,
        string="Retention Withheld",
        help="Total retention withheld by certificates on this project.")
    amount_released_before = fields.Monetary(
        compute="_compute_position", store=True, recursive=True,
        string="Already Released",
        help="Released by earlier certificates on this project.")
    amount_available = fields.Monetary(
        compute="_compute_position", store=True, recursive=True,
        string="Available to Release")
    # Deliberately not a computed field. The amount is a *default* taken from
    # the percentage, and then it is what the certificate says. As a compute
    # it inherited a dependency on `state` through the position, so submitting
    # recalculated the figure and silently discarded whatever sum had been
    # agreed and typed in — destroying the override the field exists for.
    amount_release = fields.Monetary(
        string="Amount to Release", tracking=True,
        help="Defaults to the percentage of what is still held. Override for "
             "a contract that releases an agreed figure.")

    # Stored so the register can filter on it, and so that moving a project's
    # taking-over date re-judges the certificates already raised against it.
    is_early = fields.Boolean(
        compute="_compute_is_early", store=True,
        help="Claimed before the milestone it names has been reached.")
    early_warning = fields.Char(compute="_compute_is_early")

    # ------------------------------------------------------------------
    # Position
    # ------------------------------------------------------------------
    def _released_domain(self):
        """Certificates that have taken money out of the pot.

        A draft is somebody thinking; it has not released anything. Cancelled
        never did. Everything from submitted onwards is committed enough that
        a second certificate must not offer the same money again — otherwise
        two people drafting in the same week each see the full balance.
        """
        self.ensure_one()
        return [
            ("project_id", "=", self.project_id.id),
            ("state", "in", ("submitted", "approved", "invoiced", "paid")),
            ("id", "!=", self.id or False),
        ]

    @api.depends("project_id", "state")
    def _compute_position(self):
        claim = self.env["construction.progress.claim"]
        for release in self:
            # The latest certified claim carries the cumulative retention: it
            # is a running total, not a per-period figure, so summing the
            # claims would count the same money once per certificate.
            latest = claim.search([
                ("project_id", "=", release.project_id.id),
                ("state", "in", ("certified", "invoiced", "paid")),
            ], order="sequence_no desc", limit=1)
            withheld = latest.retention_cumulative or 0.0

            others = release.search(release._released_domain()) \
                if release.project_id else release.browse()
            released = sum(others.mapped("amount_release"))

            release.amount_withheld = withheld
            release.amount_released_before = released
            release.amount_available = withheld - released

    def _default_release_amount(self):
        self.ensure_one()
        return self.amount_available * self.percent / 100.0

    @api.model_create_multi
    def create(self, vals_list):
        releases = super().create(vals_list)
        for release, vals in zip(releases, vals_list):
            # The position can only be read once the record exists — it
            # excludes itself from the certificates already holding money.
            if not vals.get("amount_release"):
                release.amount_release = release._default_release_amount()
        return releases

    @api.onchange("percent", "release_type", "project_id")
    def _onchange_percent(self):
        """Keeps the form honest while somebody is drafting on it. Only
        while drafting: a submitted certificate states a figure."""
        for release in self:
            if release.state == "draft":
                release.amount_release = release._default_release_amount()

    @api.depends("release_type", "date_release", "project_id.date_taking_over",
                 "project_id.date_dlp_end")
    def _compute_is_early(self):
        for release in self:
            milestone, label = release._milestone()
            early = bool(milestone and release.date_release
                         and release.date_release < milestone)
            release.is_early = early
            release.early_warning = self.env._(
                "Claimed before %(label)s on %(date)s.",
                label=label, date=milestone) if early else False

    def _milestone(self):
        """The contractual date this release names, and what to call it."""
        self.ensure_one()
        if self.release_type == "taking_over":
            return self.project_id.date_taking_over, self.env._("taking-over")
        if self.release_type == "dlp_expiry":
            return self.project_id.date_dlp_end, self.env._("the end of the DLP")
        return False, ""

    # ------------------------------------------------------------------
    # Guards
    # ------------------------------------------------------------------
    @api.constrains("amount_release", "state")
    def _check_not_over_released(self):
        """You cannot pay out money you never held.

        Checked as a constraint rather than only in the buttons so that a
        direct write, an import or a server action cannot walk around it.
        """
        for release in self:
            if release.state in ("draft", "cancelled"):
                continue
            if release.currency_id.compare_amounts(
                    release.amount_release, release.amount_available) > 0:
                raise UserError(self.env._(
                    "%(doc)s would release %(want)s but only %(have)s is held "
                    "on %(project)s. Retention withheld to date is %(held)s, "
                    "of which %(gone)s has already been released.",
                    doc=release.display_name,
                    want=release.amount_release,
                    have=release.amount_available,
                    project=release.project_id.display_name,
                    held=release.amount_withheld,
                    gone=release.amount_released_before,
                ))

    @api.constrains("amount_release")
    def _check_positive(self):
        for release in self:
            if release.state not in ("draft", "cancelled") and \
                    release.currency_id.compare_amounts(
                        release.amount_release, 0.0) <= 0:
                raise UserError(self.env._(
                    "A retention release must be for a positive amount."))

    # ------------------------------------------------------------------
    # Approval hooks
    # ------------------------------------------------------------------
    def _approval_amount(self):
        self.ensure_one()
        return abs(self.amount_release or 0.0)

    def _approval_kind(self):
        self.ensure_one()
        return self.release_type

    def _on_approval_granted(self, request):
        self.filtered(lambda r: r.state == "submitted").action_approve()
        return True

    def _on_approval_refused(self, request, reason):
        self.filtered(lambda r: r.state == "submitted").state = "draft"
        return True

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("paid", "cancelled")

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def action_submit(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for release in self:
            if release.state != "draft":
                raise UserError(self.env._(
                    "Only a draft release can be submitted."))
            release.state = "submitted"
            if release.is_early:
                release.message_post(body=self.env._(
                    "Submitted early — %s", release.early_warning))

    def action_approve(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for release in self:
            if release.state != "submitted":
                raise UserError(self.env._(
                    "Only a submitted release can be approved."))
            release._check_approved()
            release.state = "approved"

    def action_create_invoice(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for release in self:
            if release.state != "approved":
                raise UserError(self.env._(
                    "Approve the release before invoicing."))
            if not release.project_id.client_id:
                raise UserError(self.env._(
                    "Set the project's Client before invoicing."))
            release.move_id = release._build_invoice()
            release.state = "invoiced"
        return self.action_view_invoice()

    def _build_invoice(self):
        self.ensure_one()
        income = self.env["account.account"].search(
            [("account_type", "=", "income"),
             ("company_ids", "in", self.env.company.id)], limit=1)
        if not income:
            raise UserError(self.env._(
                "No income account found — configure the chart of accounts."))
        return self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.project_id.client_id.id,
            "invoice_date": self.date_release,
            "currency_id": self.currency_id.id,
            "invoice_origin": self.reference,
            "invoice_line_ids": [(0, 0, {
                "name": self.env._(
                    "Release of retention — %(ref)s (%(kind)s)",
                    ref=self.reference,
                    kind=dict(self._fields["release_type"].selection).get(
                        self.release_type)),
                "quantity": 1,
                "price_unit": self.amount_release,
                "account_id": income.id,
            })],
        })

    def action_view_invoice(self):
        self.ensure_one()
        if not self.move_id:
            return False
        return {
            "type": "ir.actions.act_window",
            "res_model": "account.move",
            "res_id": self.move_id.id,
            "view_mode": "form",
            "target": "current",
        }

    def action_mark_paid(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        self.filtered(lambda r: r.state == "invoiced").state = "paid"

    def action_cancel(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for release in self:
            if release.state in ("invoiced", "paid"):
                raise UserError(self.env._(
                    "An invoiced release cannot be cancelled — credit the "
                    "invoice instead, so the ledger and the certificate "
                    "agree."))
            release.state = "cancelled"

    def action_reset_to_draft(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        self.filtered(
            lambda r: r.state in ("submitted", "cancelled")).state = "draft"
