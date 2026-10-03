from odoo import models


class ConstructionDrawingRevision(models.Model):
    _inherit = "construction.drawing.revision"

    def action_open_plan_viewer(self):
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "construction_plan_viewer",
            "name": self.env._("Plan Viewer — %s", self.display_name),
            "params": {"revision_id": self.id},
        }


class ConstructionDrawing(models.Model):
    _inherit = "construction.drawing"

    def action_open_plan_viewer(self):
        self.ensure_one()
        revision = self.current_revision_id or self.revision_ids[:1]
        if not revision:
            return False
        return revision.action_open_plan_viewer()
