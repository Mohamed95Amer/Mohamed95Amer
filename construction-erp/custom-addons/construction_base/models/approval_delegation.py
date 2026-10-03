"""Somebody is away and everything stops.

The usual field fix is to share a login, which destroys the audit trail exactly
where it matters most. A delegation names who is covering, for how long, and
every signature made under it records whose authority was used.
"""

from odoo import api, fields, models
from odoo.exceptions import ValidationError


class ConstructionApprovalDelegation(models.Model):
    _name = "construction.approval.delegation"
    _description = "Approval Delegation"
    _order = "date_from desc"

    user_id = fields.Many2one(
        "res.users", string="Approver", required=True,
        default=lambda self: self.env.user,
        help="The person whose authority is being lent.")
    delegate_id = fields.Many2one(
        "res.users", string="Covered By", required=True,
        help="The person who may sign in their place.")
    date_from = fields.Date(required=True, default=fields.Date.context_today)
    date_to = fields.Date(
        required=True,
        help="Delegations end. One without a date is a permanent transfer of "
             "authority pretending to be a holiday.")
    reason = fields.Char()
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ("dates", "check(date_to >= date_from)",
         "A delegation cannot end before it starts."),
    ]

    @api.constrains("user_id", "delegate_id")
    def _check_not_self(self):
        for delegation in self:
            if delegation.user_id == delegation.delegate_id:
                raise ValidationError(self.env._(
                    "Delegating to yourself changes nothing."))

    @api.model
    def _active_for(self, approvers, delegate):
        """The delegation letting `delegate` sign for one of `approvers`."""
        if not approvers or not delegate:
            return self.browse()
        today = fields.Date.context_today(self)
        return self.sudo().search([
            ("user_id", "in", approvers.ids),
            ("delegate_id", "=", delegate.id),
            ("date_from", "<=", today),
            ("date_to", ">=", today),
        ], limit=1)

    @api.model
    def _delegates_of(self, approvers):
        """Everybody currently covering for any of these approvers."""
        if not approvers:
            return self.env["res.users"]
        today = fields.Date.context_today(self)
        delegations = self.sudo().search([
            ("user_id", "in", approvers.ids),
            ("date_from", "<=", today),
            ("date_to", ">=", today),
        ])
        return delegations.mapped("delegate_id")
