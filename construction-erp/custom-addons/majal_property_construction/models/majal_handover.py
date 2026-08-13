from odoo import fields, models
from odoo.exceptions import UserError

# A punch item is only worth importing while it is still outstanding.
# Closed defects were already dealt with on site.
OPEN_DEFECT_STATES = ("open", "in_progress", "ready", "reopened")

DEFECT_SEVERITY_TO_SNAG = {
    "low": "low",
    "medium": "medium",
    "high": "high",
    "critical": "high",
}


class MajalHandover(models.Model):
    _inherit = "majal.handover"

    site_defect_count = fields.Integer(compute="_compute_site_defect_count")

    def _open_site_defects(self):
        self.ensure_one()
        if not self.unit_id:
            return self.env["construction.defect"]
        return self.env["construction.defect"].search([
            ("unit_id", "=", self.unit_id.id),
            ("phase", "=", "punch"),
            ("state", "in", OPEN_DEFECT_STATES),
        ])

    def _compute_site_defect_count(self):
        for handover in self:
            handover.site_defect_count = len(handover._open_site_defects())

    def action_import_site_defects(self):
        """Pull the site's own outstanding punch items into the snag list.

        Retyping them would be the obvious alternative and the worst one:
        the inspection would silently disagree with the site, and the unit
        could be signed off with defects still open against it.
        """
        for handover in self:
            defects = handover._open_site_defects()
            already_imported = set(handover.snag_ids.mapped("defect_id").ids)
            new_defects = defects.filtered(
                lambda defect: defect.id not in already_imported)
            if not new_defects:
                raise UserError(
                    self.env._(
                        "There are no new outstanding punch items on %s.",
                        handover.unit_id.display_name,
                    )
                )
            self.env["majal.handover.snag"].create([
                {
                    "handover_id": handover.id,
                    "name": defect.name,
                    "location": defect.location,
                    "severity": DEFECT_SEVERITY_TO_SNAG.get(
                        defect.severity, "medium"),
                    "assigned_user_id": defect.assigned_user_id.id,
                    "defect_id": defect.id,
                }
                for defect in new_defects
            ])
        return True


class MajalHandoverSnag(models.Model):
    _inherit = "majal.handover.snag"

    defect_id = fields.Many2one(
        "construction.defect", string="Site Punch Item", readonly=True,
        ondelete="set null",
        help="Set when this snag was imported from the construction punch "
             "list rather than raised at the handover inspection.")
