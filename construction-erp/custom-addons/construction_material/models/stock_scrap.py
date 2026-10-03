from odoo import api, fields, models


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

    @api.onchange("project_id")
    def _onchange_project_id(self):
        """Point the scrap at the project's site store.

        Material lost on site was issued to that site, so it has to come off
        that store. Left on the main warehouse the quantity is deducted from
        stock the site never held, and the project's material position shows no
        waste at all.
        """
        for scrap in self:
            if scrap.project_id:
                scrap.location_id = scrap.project_id.ensure_site_location()

    def action_validate(self):
        # Safety net for scraps created programmatically (imports, demo data),
        # which never run the onchange.
        for scrap in self:
            if not scrap.project_id:
                continue
            site_location = scrap.project_id.ensure_site_location()
            if scrap.location_id != site_location:
                scrap.location_id = site_location
        return super().action_validate()
