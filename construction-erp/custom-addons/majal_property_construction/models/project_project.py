from odoo import api, fields, models


class ProjectProject(models.Model):
    _inherit = "project.project"

    development_ids = fields.One2many(
        "majal.development", "project_id", string="Developments")
    development_count = fields.Integer(compute="_compute_property_counts")
    property_unit_count = fields.Integer(compute="_compute_property_counts")

    @api.depends("development_ids", "development_ids.unit_ids")
    def _compute_property_counts(self):
        for project in self:
            project.development_count = len(project.development_ids)
            project.property_unit_count = sum(
                len(development.unit_ids) for development in project.development_ids)

    def write(self, vals):
        """A slipped taking-over date is the single most expensive piece of
        news a developer can get, because every buyer's handover payment
        moves with it. Propagating it automatically is the whole point of
        linking the two sides."""
        result = super().write(vals)
        if "date_taking_over" in vals and vals["date_taking_over"]:
            for project in self:
                for development in project.development_ids:
                    development.expected_handover_date = project.date_taking_over
                    development._reschedule_handover_installments(
                        project.date_taking_over)
        return result

    def action_view_property_units(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Units"),
            "res_model": "majal.unit",
            "view_mode": "list,form",
            "domain": [("development_id", "in", self.development_ids.ids)],
        }
