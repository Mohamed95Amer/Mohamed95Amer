"""An approval in progress, and the steps it still needs.

The step is the interesting model, not the request: a step is one person's
outstanding decision, which is exactly what an inbox is a list of. Keeping it
as a record rather than as a state on the document is what lets one screen
answer "what is waiting on me" across fourteen different kinds of document.
"""

from datetime import timedelta

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

STEP_STATES = [
    ("pending", "Waiting"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("skipped", "Skipped"),
]


class ConstructionApprovalRequest(models.Model):
    _name = "construction.approval.request"
    _description = "Approval Request"
    _inherit = ["mail.thread"]
    _order = "id desc"

    name = fields.Char(compute="_compute_name", store=True)
    res_model = fields.Char(required=True, index=True)
    res_id = fields.Integer(required=True, index=True)
    record_reference = fields.Char(readonly=True)
    project_id = fields.Many2one("project.project", index=True)
    rule_id = fields.Many2one("construction.approval.rule", ondelete="restrict")
    amount = fields.Monetary()
    currency_id = fields.Many2one(
        "res.currency", default=lambda self: self.env.company.currency_id)

    requested_by_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, readonly=True)
    requested_on = fields.Datetime(default=fields.Datetime.now, readonly=True)
    state = fields.Selection(
        [("pending", "In Progress"), ("approved", "Approved"),
         ("rejected", "Rejected"), ("cancelled", "Cancelled")],
        default="pending", tracking=True, index=True)
    decided_on = fields.Datetime(readonly=True)

    step_ids = fields.One2many("construction.approval.step", "request_id")
    current_step_id = fields.Many2one(
        "construction.approval.step", compute="_compute_current_step")

    _protected_transition_fields = {
        "state",
        "decided_on",
        "requested_by_id",
        "requested_on",
        "res_model",
        "res_id",
        "record_reference",
        "rule_id",
        "amount",
        "project_id",
    }

    def write(self, vals):
        if (
            self._protected_transition_fields & set(vals)
            and not self.env.su
        ):
            raise AccessError(
                self.env._(
                    "Approval state and decision evidence can only be changed "
                    "through the approval actions."
                )
            )
        return super().write(vals)

    def unlink(self):
        if not self.env.su:
            raise AccessError(
                self.env._("Approval requests are immutable audit evidence.")
            )
        return super().unlink()

    @api.depends("record_reference", "res_model")
    def _compute_name(self):
        for request in self:
            request.name = request.record_reference or request.res_model or ""

    @api.depends("step_ids.state")
    def _compute_current_step(self):
        for request in self:
            request.current_step_id = request.step_ids.filtered(
                lambda s: s.state == "pending")[:1]

    def _record(self):
        self.ensure_one()
        model = self.env.get(self.res_model)
        if model is None:
            return None
        return model.browse(self.res_id).exists() or None

    def action_open_record(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.record_reference or self.res_model,
            "res_model": self.res_model,
            "res_id": self.res_id,
            "views": [[False, "form"]],
            "target": "current",
        }

    def _still_covers(self, record):
        """Does this approval still answer for the document as it stands?

        Judged by the rule the value falls under, not by an exact amount: a
        variation nudged from 60,000 to 61,000 stays inside the band two people
        signed off, and sending it round again for that would teach everyone to
        route around the engine. Crossing into a band with a longer chain is a
        different document as far as the delegation of authority is concerned,
        and has to climb it.
        """
        self.ensure_one()
        current_rule = self.env["construction.approval.rule"]._match(
            record, record._approval_amount(), record._approval_kind())
        return current_rule == self.rule_id

    def _advance(self):
        """Move on after a step was approved, and finish if none are left."""
        self.ensure_one()
        if self.step_ids.filtered(lambda s: s.state == "pending"):
            return False
        self.sudo().write(
            {"state": "approved", "decided_on": fields.Datetime.now()}
        )
        record = self._record()
        if record is not None:
            # Elevated deliberately. The approver's authority is to decide, not
            # necessarily to edit: a board member signing a quarter-million
            # variation has no business holding write access to bills of
            # quantities, and requiring it would defeat the separation the
            # rules exist to create.
            record.sudo()._on_approval_granted(self)
        return True

    def _reject(self, reason):
        self.ensure_one()
        self.step_ids.filtered(lambda s: s.state == "pending").sudo().write(
            {"state": "skipped"})
        self.sudo().write(
            {"state": "rejected", "decided_on": fields.Datetime.now()}
        )
        record = self._record()
        if record is not None:
            record.sudo()._on_approval_refused(self, reason)
        return True

    def action_cancel(self):
        """Withdraw a request — the document changed and the answer is stale.

        Whoever raised it may withdraw it, and so may a manager. Anybody else
        withdrawing somebody's request is a way to make an approval quietly go
        away, which is the opposite of what the request is for.
        """
        manager = self.env.user.has_group(
            "construction_base.group_construction_manager")
        for request in self.filtered(lambda r: r.state == "pending"):
            if not manager and request.requested_by_id != self.env.user:
                raise UserError(self.env._(
                    "Only %(requester)s or a manager can withdraw this.",
                    requester=request.requested_by_id.display_name))
            request = request.sudo()
            request.step_ids.filtered(lambda s: s.state == "pending").write(
                {"state": "skipped"})
            request.sudo().write(
                {"state": "cancelled"}
            )


class ConstructionApprovalStep(models.Model):
    _name = "construction.approval.step"
    _description = "Approval Step"
    _order = "request_id desc, sequence, id"

    request_id = fields.Many2one(
        "construction.approval.request", required=True, ondelete="cascade",
        index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(required=True)
    state = fields.Selection(STEP_STATES, default="pending", index=True)

    group_id = fields.Many2one("res.groups")
    user_id = fields.Many2one("res.users", string="Named Approver")

    decided_by_id = fields.Many2one("res.users", readonly=True)
    delegated_from_id = fields.Many2one(
        "res.users", readonly=True,
        help="Set when somebody signed while covering for the named approver.")
    decided_on = fields.Datetime(readonly=True)
    reason = fields.Text(
        help="Why. A rejection without one guarantees a second cycle, and an "
             "approval without one is unreadable two years later in a claim.")

    # Denormalised for the inbox: a list of a hundred outstanding decisions
    # should not open a hundred documents to render itself.
    res_model = fields.Char(related="request_id.res_model", store=True, index=True)
    res_id = fields.Integer(related="request_id.res_id", store=True)
    record_reference = fields.Char(related="request_id.record_reference", store=True)
    project_id = fields.Many2one(related="request_id.project_id", store=True, index=True)
    amount = fields.Monetary(related="request_id.amount", store=True)
    currency_id = fields.Many2one(related="request_id.currency_id", store=True)
    requested_on = fields.Datetime(related="request_id.requested_on", store=True)
    requested_by_id = fields.Many2one(related="request_id.requested_by_id", store=True)
    waiting_days = fields.Integer(
        compute="_compute_waiting_days", search="_search_waiting_days",
        help="How long this decision has been outstanding.")

    _protected_decision_fields = {
        "state",
        "decided_by_id",
        "delegated_from_id",
        "decided_on",
        "reason",
        "request_id",
        "group_id",
        "user_id",
        "sequence",
    }

    def write(self, vals):
        if (
            self._protected_decision_fields & set(vals)
            and not self.env.su
        ):
            raise AccessError(
                self.env._(
                    "Approval decisions can only be recorded through Approve "
                    "or Reject."
                )
            )
        return super().write(vals)

    def unlink(self):
        if not self.env.su:
            raise AccessError(
                self.env._("Approval steps are immutable audit evidence.")
            )
        return super().unlink()

    @api.depends("requested_on", "state")
    def _compute_waiting_days(self):
        """Not stored, because the answer changes without the record changing.

        It was stored, and the dependencies were `requested_on` and `state` —
        neither of which is the clock. So it computed once, at creation, when
        the difference was zero, and stayed zero for ever. Everything built on
        it was quietly dead: My Day never called anything urgent, the exposure
        screen's Days column read 0 on a step outstanding for a month, and the
        two "waiting over a week" filters matched nothing.
        """
        now = fields.Datetime.now()
        for step in self:
            if step.state != "pending" or not step.requested_on:
                step.waiting_days = 0
            else:
                step.waiting_days = (now - step.requested_on).days

    def _search_waiting_days(self, operator, value):
        """Search it as what it really is: a date threshold.

        A non-stored field has no column to filter on, so the domains in the
        views are translated back into the `requested_on` cut-off they mean.
        Note the inversion — waiting longer means requested *earlier*.
        """
        inverted = {
            ">": "<", ">=": "<=", "<": ">", "<=": ">=", "=": "=", "!=": "!=",
        }
        if operator not in inverted:
            raise ValueError("Unsupported operator for waiting_days: %s" % operator)
        cutoff = fields.Datetime.now() - timedelta(days=value)
        return [("state", "=", "pending"),
                ("requested_on", inverted[operator], cutoff)]

    # ------------------------------------------------------------------
    # Who may sign
    # ------------------------------------------------------------------
    def _approvers(self):
        """Everybody entitled to sign this step, delegations included."""
        self.ensure_one()
        users = self.env["res.users"]
        if self.user_id:
            users |= self.user_id
        if self.group_id:
            users |= self.group_id.users
        return users | self.env["construction.approval.delegation"]._delegates_of(users)

    def _can_be_signed_by(self, user):
        self.ensure_one()
        if self.state != "pending":
            return False
        # Sequential: an earlier signature that has not happened yet blocks
        # this one, so a chain cannot be signed from the bottom up.
        earlier = self.request_id.step_ids.filtered(
            lambda s: s.sequence < self.sequence or
            (s.sequence == self.sequence and s.id < self.id))
        if earlier.filtered(lambda s: s.state == "pending"):
            return False
        if user not in self._approvers():
            return False
        rule = self.request_id.rule_id
        if rule.require_other_user and user == self.request_id.requested_by_id:
            return False
        return True

    def _delegator_for(self, user):
        """Whose authority is being used, when it is not the signer's own."""
        self.ensure_one()
        named = self.env["res.users"]
        if self.user_id:
            named |= self.user_id
        if self.group_id:
            named |= self.group_id.users
        if user in named:
            return self.env["res.users"]
        delegation = self.env["construction.approval.delegation"]._active_for(
            named, user)
        return delegation.user_id if delegation else self.env["res.users"]

    # ------------------------------------------------------------------
    # The inbox
    # ------------------------------------------------------------------
    @api.model
    def _waiting_on(self, user):
        """Steps this user can sign right now.

        Written as a search plus a filter rather than as one clever domain:
        entitlement depends on delegations and on whether an earlier step is
        still outstanding, and neither is expressible in SQL without a join
        nobody would be able to read a year from now. The search narrows to
        the user's own groups first, so the filtered set is small.
        """
        delegating = self.env["construction.approval.delegation"].sudo().search([
            ("delegate_id", "=", user.id),
            ("date_from", "<=", fields.Date.context_today(self)),
            ("date_to", ">=", fields.Date.context_today(self)),
        ]).mapped("user_id")
        candidates = self.search([
            ("state", "=", "pending"),
            ("request_id.state", "=", "pending"),
            "|", "|",
            ("user_id", "in", (user | delegating).ids),
            ("group_id", "in", user.groups_id.ids),
            ("group_id", "in", delegating.groups_id.ids),
        ])
        return candidates.filtered(lambda s: s._can_be_signed_by(user))

    @api.model
    def _inbox_action(self):
        steps = self._waiting_on(self.env.user)
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Waiting for me"),
            "res_model": "construction.approval.step",
            "view_mode": "list,form",
            "domain": [("id", "in", steps.ids)],
            "context": {"search_default_group_model": 1},
            "help": f"""<p class="o_view_nocontent_smiling_face">{
                self.env._("Nothing is waiting for you")}</p>
                <p>{self.env._(
                    "Approvals raised against your role or delegated to you "
                    "appear here, whichever kind of document they belong to.")}
                </p>""",
        }

    def action_open_document(self):
        self.ensure_one()
        return self.request_id.action_open_record()

    # ------------------------------------------------------------------
    # Deciding
    # ------------------------------------------------------------------
    def action_approve(self, reason=False):
        for step in self:
            step._decide("approved", reason)
        return True

    def action_reject(self, reason=False):
        for step in self:
            step._decide("rejected", reason)
        return True

    def _decide(self, decision, reason):
        self.ensure_one()
        user = self.env.user
        if not self._can_be_signed_by(user):
            raise UserError(self._refusal_reason(user))
        if decision == "rejected" and not reason:
            raise UserError(self.env._(
                "Say why it is rejected. Without a reason it comes straight "
                "back unchanged."))
        # Elevated *after* the gate, never before it. Approvers no longer hold
        # write access on steps and requests — that access was the bypass: a
        # plain write({'state': 'approved'}) never reached _can_be_signed_by,
        # so the entitlement check above could simply be stepped around. The
        # authority to decide is expressed by passing that check; recording the
        # decision is a consequence, and runs with the rights it needs.
        signed = self.sudo()
        signed.write({
            "state": decision,
            "decided_by_id": user.id,
            "delegated_from_id": self._delegator_for(user).id,
            "decided_on": fields.Datetime.now(),
            "reason": reason or self.reason,
        })
        request = signed.request_id
        if decision == "rejected":
            request._reject(reason)
        else:
            request._advance()
        record = request._record()
        if record is not None and hasattr(record, "_approval_note"):
            record._approval_note(self._decision_message(decision, reason))

    def _decision_message(self, decision, reason):
        self.ensure_one()
        verb = (self.env._("approved") if decision == "approved"
                else self.env._("rejected"))
        body = self.env._(
            "%(step)s %(verb)s by %(user)s.",
            step=self.name, verb=verb, user=self.env.user.display_name)
        if self.delegated_from_id:
            body += " " + self.env._(
                "On behalf of %s.", self.delegated_from_id.display_name)
        if reason:
            body += f" {reason}"
        return body

    def _refusal_reason(self, user):
        """Say which rule stopped them. 'Access denied' teaches nobody."""
        self.ensure_one()
        if self.state != "pending":
            return self.env._("This step has already been decided.")
        earlier = self.request_id.step_ids.filtered(
            lambda s: s.state == "pending" and (
                s.sequence < self.sequence
                or (s.sequence == self.sequence and s.id < self.id)))
        if earlier:
            return self.env._(
                "%s has to approve this first.", earlier[0].name)
        rule = self.request_id.rule_id
        if (rule.require_other_user
                and user == self.request_id.requested_by_id):
            return self.env._(
                "You raised this, so somebody else has to approve it.")
        return self.env._(
            "This approval is for %s.",
            self.user_id.display_name or self.group_id.display_name
            or self.env._("somebody else"))
