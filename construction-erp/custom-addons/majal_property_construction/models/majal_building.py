from odoo import api, fields, models
from odoo.exceptions import ValidationError


class MajalBuilding(models.Model):
    _inherit = "majal.building"

    project_id = fields.Many2one(
        "project.project", string="Construction Project",
        domain="[('is_construction', '=', True)]",
        help="Set only where a building is delivered by its own project, "
             "separately from the rest of the development.")

    @api.constrains("project_id", "development_id")
    def _check_project_matches_development(self):
        """A building delivered by a different project than its own
        development is almost always a mis-click, and it would send the
        wrong taking-over date to the wrong buyers."""
        for building in self:
            development_project = building.development_id.project_id
            if (building.project_id and development_project
                    and building.project_id != development_project):
                raise ValidationError(
                    self.env._(
                        "%(building)s is under %(building_project)s, but its "
                        "development is delivered by %(development_project)s.",
                        building=building.display_name,
                        building_project=building.project_id.display_name,
                        development_project=development_project.display_name,
                    )
                )
