from odoo import _, api, fields, models


class MajalEndAllocationWizard(models.TransientModel):
    """Take somebody off the work, and deal with what they were holding.

    Ending an allocation takes access away, which is the point. The trap is
    approvals: a step waiting on somebody who can no longer open the record
    sits in their inbox looking healthy while the document behind it is
    unreachable. The projection refuses to strip those people until the
    approval is resolved, and this wizard is where that gets said out loud and
    a delegation offered.
    """

    _name = "majal.end.allocation.wizard"
    _description = "End Allocations"

    allocation_ids = fields.Many2many(
        "majal.allocation", string="Allocations", required=True)
    date_end = fields.Date(
        string="Last day", required=True, default=fields.Date.context_today)
    pending_warning = fields.Text(compute="_compute_pending")
    has_pending = fields.Boolean(compute="_compute_pending")
    delegate_id = fields.Many2one(
        "res.users",
        string="Hand approvals to",
        domain="[('share', '=', False)]",
        help="Creates a delegation so the approvals they are holding keep "
             "moving after they leave.",
    )

    @api.depends("allocation_ids")
    def _compute_pending(self):
        Allocation = self.env["majal.allocation"]
        for wizard in self:
            stuck = []
            for allocation in wizard.allocation_ids:
                if not allocation.project_id or not allocation.user_id:
                    continue
                holders = Allocation._majal_users_holding_approvals(
                    allocation.project_id)
                if allocation.user_id in holders:
                    stuck.append("%s — %s" % (
                        allocation.employee_id.name,
                        allocation.project_id.display_name,
                    ))
            wizard.has_pending = bool(stuck)
            wizard.pending_warning = _(
                "Still holding approvals:\n%s\n\nTheir access will be kept "
                "until those are signed or handed over, so nothing gets "
                "stranded.",
                "\n".join(stuck),
            ) if stuck else False

    def action_end(self):
        self.ensure_one()
        if self.delegate_id:
            Delegation = self.env["construction.approval.delegation"].sudo()
            for user in self.allocation_ids.mapped("user_id"):
                if not user or user == self.delegate_id:
                    continue
                Delegation.create({
                    "user_id": user.id,
                    "delegate_id": self.delegate_id.id,
                    "date_from": fields.Date.context_today(self),
                    "date_to": fields.Date.add(
                        fields.Date.context_today(self), days=90),
                    "reason": _("Left the project team"),
                })
        self.allocation_ids.write({"date_end": self.date_end})
        return {"type": "ir.actions.act_window_close"}
