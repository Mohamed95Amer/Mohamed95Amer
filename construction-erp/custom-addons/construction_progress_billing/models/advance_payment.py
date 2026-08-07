"""The advance, and getting it back out of the certificates.

Near universal in Gulf contracting and absent from the product entirely: the
employer pays a percentage up front against a bank guarantee, and recovers it
by deducting a slice of every interim certificate until it is square.

Two failures matter and they pull in opposite directions. Recovering too
little leaves the employer exposed at the end of a job — the money is gone and
the guarantee has usually expired. Recovering too much takes money the
contractor is owed, on a deduction nobody re-reads once it is automatic. Both
are arithmetic, so both are enforced rather than trusted: recovery is clamped
at the advance, and the clamp is asserted.

The guarantee is recorded here too. Its expiry is the thing that actually
hurts — an advance still outstanding against a guarantee that lapsed last
month is an unsecured loan — so it is surfaced rather than filed.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.addons.construction_base.models.approval_mixin import (
    WORKFLOW_TRANSITION,
)


class ConstructionAdvancePayment(models.Model):
    _name = "construction.advance.payment"
    _description = "Advance Payment"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin", "construction.approvable"]
    _doc_prefix = "ADV"
    _order = "project_id, date_advance desc, id desc"

    name = fields.Char(default=lambda self: self.env._("Advance Payment"))
    date_advance = fields.Date(
        string="Advance Date", default=fields.Date.context_today,
        required=True, tracking=True)
    currency_id = fields.Many2one(related="project_id.currency_id", store=True)
    state = fields.Selection(
        [("draft", "Draft"), ("submitted", "Submitted"),
         ("approved", "Approved"), ("invoiced", "Invoiced"),
         ("paid", "Paid"), ("cancelled", "Cancelled")],
        default="draft", tracking=True, index=True)
    move_id = fields.Many2one("account.move", readonly=True, copy=False)

    amount = fields.Monetary(
        string="Advance Amount", required=True, tracking=True)
    recovery_percent = fields.Float(
        string="Recovery Rate (%)", default=20.0,
        help="Percentage of the work certified on each certificate that is "
             "withheld to repay the advance.")
    recovery_start_percent = fields.Float(
        string="Start Recovery After (% complete)", default=0.0,
        help="Contracts often let the contractor keep the advance until the "
             "job is properly under way. Recovery is taken only on work "
             "certified beyond this share of the contract.")

    # Guarantee
    guarantee_reference = fields.Char(string="Guarantee Ref.")
    guarantee_bank = fields.Char(string="Issuing Bank")
    guarantee_expiry = fields.Date(string="Guarantee Expires")
    # Two compute methods on purpose: a stored and a non-stored field must
    # not share one, or reading the non-stored field recomputes and writes
    # the stored one behind the caller's back.
    guarantee_lapsed = fields.Boolean(
        compute="_compute_guarantee_lapsed", store=True,
        help="The guarantee has expired while money is still outstanding — "
             "the advance is unsecured.")
    guarantee_warning = fields.Char(compute="_compute_guarantee_warning")

    amount_recovered = fields.Monetary(
        compute="_compute_recovery", string="Recovered to Date")
    amount_outstanding = fields.Monetary(
        compute="_compute_recovery", string="Still Outstanding")
    recovery_complete = fields.Boolean(compute="_compute_recovery")

    # ------------------------------------------------------------------
    # Position
    # ------------------------------------------------------------------
    def _compute_recovery(self):
        claim = self.env["construction.progress.claim"]
        for advance in self:
            latest = claim.search([
                ("project_id", "=", advance.project_id.id),
                ("state", "in", ("certified", "invoiced", "paid")),
            ], order="sequence_no desc", limit=1)
            # Cumulative on the certificate, so the latest one carries it all.
            recovered = latest.advance_recovery_cumulative or 0.0
            advance.amount_recovered = recovered
            advance.amount_outstanding = advance.amount - recovered
            advance.recovery_complete = advance.currency_id.compare_amounts(
                recovered, advance.amount) >= 0 if advance.currency_id else False

    def _is_guarantee_lapsed(self):
        self.ensure_one()
        return bool(
            self.guarantee_expiry
            and self.guarantee_expiry < fields.Date.context_today(self)
            and self.state in ("approved", "invoiced", "paid"))

    @api.depends("guarantee_expiry", "amount", "state")
    def _compute_guarantee_lapsed(self):
        for advance in self:
            advance.guarantee_lapsed = advance._is_guarantee_lapsed()

    @api.depends("guarantee_expiry", "amount", "state")
    def _compute_guarantee_warning(self):
        for advance in self:
            advance.guarantee_warning = self.env._(
                "The advance payment guarantee expired on %(date)s. Anything "
                "still outstanding is unsecured.",
                date=advance.guarantee_expiry
            ) if advance._is_guarantee_lapsed() else False

    # ------------------------------------------------------------------
    # Guards
    # ------------------------------------------------------------------
    @api.constrains("amount", "state")
    def _check_amount(self):
        for advance in self:
            if advance.state in ("draft", "cancelled"):
                continue
            if advance.currency_id.compare_amounts(advance.amount, 0.0) <= 0:
                raise UserError(self.env._(
                    "An advance must be for a positive amount."))

    @api.constrains("recovery_percent")
    def _check_recovery_percent(self):
        for advance in self:
            if not 0 < advance.recovery_percent <= 100:
                raise UserError(self.env._(
                    "The recovery rate must be between 0 and 100 percent. "
                    "At zero the advance is never repaid."))

    @api.constrains("project_id", "state")
    def _check_one_live_advance(self):
        """One live advance per project.

        Recovery is taken as a share of certified work, so two live advances
        would each claim their own slice of the same certificate and the
        deduction would silently double.
        """
        for advance in self:
            if advance.state in ("draft", "cancelled"):
                continue
            others = self.search([
                ("project_id", "=", advance.project_id.id),
                ("state", "not in", ("draft", "cancelled")),
                ("id", "!=", advance.id),
            ])
            if others:
                raise UserError(self.env._(
                    "%(project)s already has a live advance (%(other)s). "
                    "Recovery is a share of each certificate, so a second "
                    "one would double the deduction.",
                    project=advance.project_id.display_name,
                    other=others[0].display_name))

    # ------------------------------------------------------------------
    # Recovery arithmetic — the one place it is defined
    # ------------------------------------------------------------------
    def _recovery_for(self, work_done_cumulative, contract_value):
        """Cumulative recovery due once `work_done_cumulative` is certified.

        Clamped at the advance: over-recovering takes money the contractor is
        owed, on a deduction nobody re-reads once it runs automatically.
        """
        self.ensure_one()
        if self.state in ("draft", "cancelled"):
            return 0.0
        threshold = contract_value * self.recovery_start_percent / 100.0
        eligible = max(0.0, work_done_cumulative - threshold)
        return min(self.amount, eligible * self.recovery_percent / 100.0)

    # ------------------------------------------------------------------
    # Approval hooks
    # ------------------------------------------------------------------
    def _approval_amount(self):
        self.ensure_one()
        return abs(self.amount or 0.0)

    def _on_approval_granted(self, request):
        self.filtered(lambda a: a.state == "submitted").action_approve()
        return True

    def _on_approval_refused(self, request, reason):
        self.filtered(lambda a: a.state == "submitted").state = "draft"
        return True

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("paid", "cancelled")

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def action_submit(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for advance in self:
            if advance.state != "draft":
                raise UserError(self.env._(
                    "Only a draft advance can be submitted."))
            advance.state = "submitted"

    def action_approve(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for advance in self:
            if advance.state != "submitted":
                raise UserError(self.env._(
                    "Only a submitted advance can be approved."))
            advance._check_approved()
            advance.state = "approved"

    def action_create_invoice(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for advance in self:
            if advance.state != "approved":
                raise UserError(self.env._(
                    "Approve the advance before invoicing."))
            if not advance.project_id.client_id:
                raise UserError(self.env._(
                    "Set the project's Client before invoicing."))
            advance.move_id = advance._build_invoice()
            advance.state = "invoiced"
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
            "invoice_date": self.date_advance,
            "currency_id": self.currency_id.id,
            "invoice_origin": self.reference,
            "invoice_line_ids": [(0, 0, {
                "name": self.env._(
                    "Advance payment — %(ref)s (recovered at %(pct)s%% of "
                    "certified work)", ref=self.reference,
                    pct=self.recovery_percent),
                "quantity": 1,
                "price_unit": self.amount,
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
        self.filtered(lambda a: a.state == "invoiced").state = "paid"

    def action_cancel(self):
        self = self.with_context(majal_workflow_transition=WORKFLOW_TRANSITION)
        for advance in self:
            if advance.state in ("invoiced", "paid") and \
                    advance.amount_recovered:
                raise UserError(self.env._(
                    "This advance has already been recovered against "
                    "certificates. Cancelling it would leave those "
                    "deductions with nothing to repay."))
            advance.state = "cancelled"

    def action_view_claims(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Certificates — %s", self.reference),
            "res_model": "construction.progress.claim",
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.project_id.id)],
        }
