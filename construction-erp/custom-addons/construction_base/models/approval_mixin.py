"""What a document gains by being approvable.

Inheriting this gives a record an approval state, a request when one is needed,
and — the point of the exercise — a single method that refuses to let an
unauthorised person approve it. The previous arrangement put the rule in a
`groups` attribute on a button, which is a UI instruction: it hid the button
and left the method callable. A commercial user with no PM rights could and
did approve a 197,400 variation from a shell.

Models opt in by inheriting and overriding two hooks: what the document is
worth, and what kind it is.
"""

import logging

from odoo import api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)



# A value the caller cannot forge.
#
# This guard used to stand down for `majal_workflow_transition=WORKFLOW_TRANSITION` in the
# context. Context travels with an RPC call, so anybody holding write access on
# an approvable document could set that key and write `state` directly — which
# skips _check_approved() and defeats the approval engine through the document
# instead of through the step. It is the same hole that was removed from
# res_users and from the approval step, arriving by a third door.
#
# RPC can only deliver JSON, so a context value can never be *identical* to a
# private Python object. Server-side callers import this and pass it; a remote
# caller can send the string, the number or the boolean and none of them are
# this object.
WORKFLOW_TRANSITION = object()


class ConstructionApprovable(models.AbstractModel):
    _name = "construction.approvable"
    _description = "Approvable Document"

    approval_request_ids = fields.One2many(
        "construction.approval.request", compute="_compute_approval",
        string="Approval Requests")
    approval_state = fields.Selection(
        [("none", "Not required"), ("pending", "Waiting for approval"),
         ("approved", "Approved"), ("rejected", "Rejected")],
        compute="_compute_approval", string="Approval")
    approval_summary = fields.Char(compute="_compute_approval")
    approval_blocked = fields.Boolean(
        compute="_compute_approval",
        help="True while an approval is outstanding, so a form can stop "
        "offering the button that needs it.")

    def write(self, values):
        if (
            "state" in values
            and not self.env.su
            and self.env.context.get("majal_workflow_transition")
            is not WORKFLOW_TRANSITION
        ):
            raise AccessError(
                self.env._(
                    "Use the document workflow actions to change status. "
                    "Direct state changes are blocked."
                )
            )
        return super().write(values)

    def unlink(self):
        if not self.env.su:
            protected = self.filtered(
                lambda record: (
                    record._open_approval_request()
                    or (
                        "state" in record._fields
                        and record.state not in ("draft", "rejected", "cancelled")
                    )
                )
            )
            if protected:
                raise AccessError(
                    self.env._(
                        "Submitted workflow records are retained as audit evidence."
                    )
                )
        return super().unlink()

    # ------------------------------------------------------------------
    # Hooks for the inheriting model
    # ------------------------------------------------------------------
    def _approval_amount(self):
        """What this document is worth, for matching a value band.

        Zero is a fine answer — a permit or an inspection has no value and is
        matched on its kind alone.
        """
        self.ensure_one()
        for field in ("amount_sell_total", "amount_total", "contract_value",
                      "amount"):
            if field in self._fields:
                return abs(self[field] or 0.0)
        return 0.0

    def _approval_kind(self):
        """An optional narrowing within the model, e.g. addition vs omission."""
        self.ensure_one()
        for field in ("change_type", "claim_type", "permit_type", "doc_type"):
            if field in self._fields:
                return self[field] or False
        return False

    def _on_approval_granted(self, request):
        """Called once every step has said yes. Override to change state."""
        return True

    def _on_approval_refused(self, request, reason):
        """Called on rejection. Override to move the document backwards."""
        return True

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------
    def _compute_approval(self):
        requests_by_key = {}
        if self.ids:
            for request in self.env["construction.approval.request"].sudo().search([
                ("res_model", "=", self._name), ("res_id", "in", self.ids),
            ], order="id desc"):
                requests_by_key.setdefault(request.res_id, request)
        for record in self:
            request = requests_by_key.get(record.id)
            record.approval_request_ids = request
            record.approval_state = request.state if request else "none"
            record.approval_blocked = bool(request and request.state == "pending")
            if not request:
                record.approval_summary = ""
            elif request.state == "pending":
                step = request.current_step_id
                record.approval_summary = self.env._(
                    "Waiting on %s", step.name) if step else self.env._("Waiting")
            else:
                record.approval_summary = dict(
                    request._fields["state"].selection).get(request.state, "")

    def _approval_rule(self):
        self.ensure_one()
        return self.env["construction.approval.rule"]._match(
            self, self._approval_amount(), self._approval_kind())

    def _open_approval_request(self):
        self.ensure_one()
        return self.env["construction.approval.request"].sudo().search([
            ("res_model", "=", self._name), ("res_id", "=", self.id),
            ("state", "=", "pending"),
        ], limit=1)

    # ------------------------------------------------------------------
    # Requesting
    # ------------------------------------------------------------------
    def action_request_approval(self):
        """Raise the approval this document needs, if it needs one."""
        created = self.env["construction.approval.request"]
        for record in self:
            if record._open_approval_request():
                raise UserError(self.env._(
                    "This is already waiting for approval."))
            rule = record._approval_rule()
            if not rule:
                raise UserError(self.env._(
                    "No approval rule covers this document. Either it does not "
                    "need approving, or a rule is missing for its value."))
            created |= record._create_approval_request(rule)
        return created

    def _create_approval_request(self, rule):
        self.ensure_one()
        request = self.env["construction.approval.request"].sudo().create({
            "res_model": self._name,
            "res_id": self.id,
            "record_reference": self.display_name,
            "project_id": (self.project_id.id
                           if "project_id" in self._fields else False),
            "rule_id": rule.id,
            "amount": self._approval_amount(),
            "requested_by_id": self.env.user.id,
            "step_ids": [
                (0, 0, {
                    "sequence": step.sequence,
                    "name": step.name,
                    "group_id": step.group_id.id,
                    "user_id": step.user_id.id,
                })
                for step in rule.step_ids
            ],
        })
        self._approval_note(self.env._("Approval requested: %s.", rule.name))
        return request

    def _approval_note(self, body):
        """Leave a trace on the document, and never fail the action for it.

        Chatter is a convenience here; the request and its steps are the audit
        trail. Odoo refuses to post on behalf of a user with no email address,
        which is an ordinary state for a site foreman whose account an admin
        created in a hurry — and losing an approval to that would be absurd.
        """
        if not hasattr(self, "message_post"):
            return False
        try:
            self.message_post(body=body)
        except Exception as err:  # noqa: BLE001 - never block on a note
            _logger.info("Approval note not posted on %s: %s",
                         self.display_name, err)
            return False
        return True

    # ------------------------------------------------------------------
    # Enforcement — the whole point
    # ------------------------------------------------------------------
    def _check_approved(self):
        """Refuse unless this document is cleared to proceed.

        Called from the existing action_approve / action_certify methods, so
        the rule holds wherever the call comes from — a button, a script, the
        RPC console, or a future screen nobody has written yet.
        """
        for record in self:
            request = record._open_approval_request()
            if request:
                step = request.current_step_id
                raise UserError(self.env._(
                    "This is waiting for approval: %s.",
                    step.name if step else request.name))
            rule = record._approval_rule()
            if not rule:
                # Nothing governs a document of this value: the old behaviour,
                # kept deliberately so a suite with no rules still works.
                continue
            latest = self.env["construction.approval.request"].sudo().search([
                ("res_model", "=", record._name), ("res_id", "=", record.id),
                ("state", "=", "approved"),
            ], order="decided_on desc, id desc", limit=1)
            # An approval is of a document at a value, not of a document
            # forever. Without this, the cheapest way past a three-signature
            # threshold is to get a small version approved and then edit it:
            # the historical request still says "approved", and the chain that
            # a quarter-million variation is supposed to climb never runs.
            if latest and not latest._still_covers(record):
                raise UserError(self.env._(
                    "%(document)s changed after it was approved — it was "
                    "cleared at %(approved)s and now stands at %(current)s, "
                    "so %(rule)s applies again.",
                    document=record.display_name,
                    approved=latest.amount,
                    current=record._approval_amount(),
                    rule=rule.name))
            if not latest:
                # A permit and a bill both arrive here, and only one of them
                # has a value. Saying "applies at this value" about a permit
                # reads as a bug in the sentence.
                if record._approval_amount():
                    message = self.env._(
                        "%(document)s needs approving first — %(rule)s applies "
                        "at this value.",
                        document=record.display_name, rule=rule.name)
                else:
                    message = self.env._(
                        "%(document)s needs approving first — %(rule)s applies.",
                        document=record.display_name, rule=rule.name)
                raise UserError(message)
        return True

    def action_view_approval(self):
        self.ensure_one()
        request = self.approval_request_ids[:1]
        if not request:
            raise UserError(self.env._("Nothing has been requested yet."))
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Approval"),
            "res_model": "construction.approval.request",
            "res_id": request.id,
            "views": [[False, "form"]],
            "target": "new",
        }

    @api.model
    def _approval_inbox_action(self):
        """Everything waiting on the current user, across every model."""
        return self.env["construction.approval.step"]._inbox_action()
