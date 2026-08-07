from odoo import fields, models


class ConstructionDrawing(models.Model):
    """The reverse of RFI.drawing_revision_ids — a drawing had no way to show
    which RFIs cite it, so a reviewer working from the drawing register had
    to search the RFI register by hand to find out."""

    _inherit = "construction.drawing"

    citing_rfi_ids = fields.Many2many(
        "construction.rfi", compute="_compute_citing_rfi_ids")
    citing_rfi_count = fields.Integer(compute="_compute_citing_rfi_ids")

    def _compute_citing_rfi_ids(self):
        for drawing in self:
            rfis = self.env["construction.rfi"].search(
                [("drawing_revision_ids.drawing_id", "=", drawing.id)])
            drawing.citing_rfi_ids = rfis
            drawing.citing_rfi_count = len(rfis)

    def action_view_citing_rfis(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("RFIs — %s", self.number),
            "res_model": "construction.rfi",
            "view_mode": "list,form",
            "domain": [("drawing_revision_ids.drawing_id", "=", self.id)],
        }
