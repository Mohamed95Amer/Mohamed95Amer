from odoo import fields, models


class StockMove(models.Model):
    _inherit = "stock.move"

    construction_issue_id = fields.Many2one(
        "construction.material.issue", string="Material Issue",
        readonly=True, index=True, ondelete="set null")


class StockScrap(models.Model):
    """Site waste, recorded against a project and a reason.

    Core scrap already books the stock and the valuation; what it cannot answer
    is the question a site manager is asked every month — which project lost the
    material and why. Without a reason code, waste is a single number nobody can
    act on; with one, over-ordering and damage-in-handling stop looking alike.
    """

    _inherit = "stock.scrap"

    project_id = fields.Many2one(
        "project.project",
        string="Project",
        domain=[("is_construction", "=", True)],
        index=True,
        help="Construction project the wasted material belonged to.",
    )
    waste_reason = fields.Selection(
        [
            ("offcut", "Offcut / Cutting Waste"),
            ("damage", "Damaged in Handling"),
            ("weather", "Weather Damage"),
            ("over_order", "Over-ordered / Surplus"),
            ("rework", "Rework / Defective Work"),
            ("spillage", "Spillage / Mixing Loss"),
            ("expired", "Expired / Set"),
            ("theft", "Loss / Unaccounted"),
            ("other", "Other"),
        ],
        help="Why the material was lost. Offcuts are a design and ordering "
             "question; damage and spillage are a site-handling one.",
    )
    waste_note = fields.Char()

    def action_validate(self):
        """Default the scrap source to the project's site store."""
        for scrap in self:
            if scrap.project_id and not scrap.project_id.site_location_id:
                scrap.project_id.ensure_site_location()
        return super().action_validate()
