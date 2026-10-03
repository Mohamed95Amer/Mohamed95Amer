from odoo import fields, models


class ConstructionRfi(models.Model):
    _inherit = "construction.rfi"

    change_event_ids = fields.One2many(
        "construction.change.event", "source_rfi_id")
    change_event_count = fields.Integer(compute="_compute_change_event_count")

    def _compute_change_event_count(self):
        for rfi in self:
            rfi.change_event_count = len(rfi.change_event_ids)

    def action_raise_change_event(self):
        self.ensure_one()
        event = self.env["construction.change.event"].create({
            "name": self.name,
            "project_id": self.project_id.id,
            "origin": "rfi",
            "source_rfi_id": self.id,
            "description": self.answer or self.question,
        })
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.change.event",
            "res_id": event.id,
            "view_mode": "form",
            "target": "current",
        }
