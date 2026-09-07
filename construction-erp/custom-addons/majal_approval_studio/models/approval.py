from odoo import api, fields, models


class ConstructionApprovalRule(models.Model):
    _inherit = "construction.approval.rule"

    step_count = fields.Integer(
        string="Approval steps", compute="_compute_studio_summary", store=True
    )
    scope_label = fields.Char(
        string="Workflow scope", compute="_compute_studio_summary", store=True
    )

    @api.depends("step_ids", "model_id", "document_kind", "project_id")
    def _compute_studio_summary(self):
        for rule in self:
            rule.step_count = len(rule.step_ids)
            parts = [rule.model_id.name or "Any document"]
            if rule.document_kind:
                parts.append(rule.document_kind)
            if rule.project_id:
                parts.append(rule.project_id.display_name)
            rule.scope_label = " · ".join(parts)


class ConstructionApprovalRequest(models.Model):
    _inherit = "construction.approval.request"

    pending_step_count = fields.Integer(
        string="Pending steps", compute="_compute_studio_summary", store=True
    )
    progress_percent = fields.Float(
        string="Progress %", compute="_compute_studio_summary", store=True
    )

    @api.depends("step_ids.state")
    def _compute_studio_summary(self):
        for request in self:
            total = len(request.step_ids)
            pending = len(request.step_ids.filtered(lambda step: step.state == "pending"))
            request.pending_step_count = pending
            request.progress_percent = (
                100.0 * (total - pending) / total if total else 0.0
            )
