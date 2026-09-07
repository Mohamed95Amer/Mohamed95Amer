from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionApprovalDecision(models.TransientModel):
    """Decide on one or many steps at once.

    Batch matters more than it sounds. Most of what an approver faces is
    routine — twelve daily logs and four inspections — and making them open
    each one is how the four that matter end up rubber-stamped alongside them.
    """

    _name = "construction.approval.decision"
    _description = "Approve or Reject"

    step_ids = fields.Many2many("construction.approval.step", required=True)
    decision = fields.Selection(
        [("approved", "Approve"), ("rejected", "Reject")],
        default="approved", required=True)
    reason = fields.Text()
    step_count = fields.Integer(compute="_compute_step_count")
    total_amount = fields.Monetary(compute="_compute_step_count")
    currency_id = fields.Many2one(
        "res.currency", default=lambda self: self.env.company.currency_id)

    @api.depends("step_ids")
    def _compute_step_count(self):
        for wizard in self:
            wizard.step_count = len(wizard.step_ids)
            wizard.total_amount = sum(wizard.step_ids.mapped("amount"))

    @api.model
    def default_get(self, fields_list):
        values = super().default_get(fields_list)
        active_ids = self.env.context.get("active_ids")
        if active_ids and self.env.context.get("active_model") == \
                "construction.approval.step":
            values["step_ids"] = [(6, 0, active_ids)]
        return values

    def action_confirm(self):
        self.ensure_one()
        if not self.step_ids:
            raise UserError(self.env._("Nothing selected."))
        if self.decision == "rejected":
            self.step_ids.action_reject(self.reason)
        else:
            self.step_ids.action_approve(self.reason)
        return {"type": "ir.actions.act_window_close"}
