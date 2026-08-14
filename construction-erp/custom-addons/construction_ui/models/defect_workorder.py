"""Raising a defect should raise the work that fixes it.

Before this, a defect and a work order were unrelated records: the snag sat in
the quality register and somebody re-typed it into maintenance, or nobody did.
Nothing in the codebase linked the two.

The bridge lives here rather than in construction_defect because that module
depends on neither maintenance nor facility_workorder, and widening it would
pull the maintenance app into every construction-only install. construction_ui
already depends on both.
"""

from odoo import _, api, fields, models


class ConstructionDefect(models.Model):
    _inherit = "construction.defect"

    workorder_id = fields.Many2one(
        "maintenance.request",
        string="Work Order",
        readonly=True,
        copy=False,
        help="Raised automatically when the defect is assigned, so the person "
             "who has to fix it sees it in the queue they actually work from.",
    )

    def _workorder_values(self):
        """What the work order carries over from the defect."""
        self.ensure_one()
        return {
            "name": self.name or self.reference or _("Defect"),
            "description": self.description or "",
            "user_id": self.assigned_user_id.id,
            "owner_user_id": self.env.uid,
            "maintenance_type": "corrective",
            "company_id": self.company_id.id or self.env.company.id,
            # A critical snag should not queue behind routine work.
            "priority": {"low": "0", "medium": "1",
                         "high": "2", "critical": "3"}.get(self.severity, "1"),
        }

    def _sync_workorder(self):
        """Create the work order once, for defects that have someone to do it.

        Idempotent on purpose: this runs from create and from write, and a
        defect reassigned twice should move its work order, not accumulate
        duplicates.
        """
        for defect in self:
            if not defect.assigned_user_id:
                continue
            if defect.workorder_id:
                if defect.workorder_id.user_id != defect.assigned_user_id:
                    defect.workorder_id.user_id = defect.assigned_user_id
                continue
            defect.workorder_id = self.env["maintenance.request"].create(
                defect._workorder_values()
            )

    @api.model_create_multi
    def create(self, vals_list):
        defects = super().create(vals_list)
        defects._sync_workorder()
        return defects

    def write(self, vals):
        result = super().write(vals)
        if "assigned_user_id" in vals:
            self._sync_workorder()
        return result

    def action_view_workorder(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Work Order"),
            "res_model": "maintenance.request",
            "res_id": self.workorder_id.id,
            "view_mode": "form",
        }
