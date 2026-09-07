from odoo import fields, models


class ConstructionRfi(models.Model):
    _inherit = "construction.rfi"

    change_event_ids = fields.One2many(
        "construction.change.event", "source_rfi_id", string="Change Orders")
    change_event_count = fields.Integer(
        compute="_compute_change_event_count", string="Change Order Count")

    def _compute_change_event_count(self):
        for rfi in self:
            rfi.change_event_count = len(rfi.change_event_ids)

    def action_view_change_events(self):
        """Where the "Raise Change Order" button led, for whoever comes back
        to this RFI later and has no other way to find it — the form had no
        button box at all before this, so a change event once raised was
        reachable only by searching the Change Orders register by hand."""
        self.ensure_one()
        action = {
            "type": "ir.actions.act_window",
            "name": self.env._("Change Orders"),
            "res_model": "construction.change.event",
            "domain": [("source_rfi_id", "=", self.id)],
            "context": {"default_source_rfi_id": self.id,
                       "default_project_id": self.project_id.id},
        }
        if self.change_event_count == 1:
            action.update(
                view_mode="form", res_id=self.change_event_ids.id)
        else:
            action["view_mode"] = "list,form"
        return action

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
