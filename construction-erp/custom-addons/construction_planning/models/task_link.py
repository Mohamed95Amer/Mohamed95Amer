from odoo import api, fields, models
from odoo.exceptions import ValidationError

from . import cpm


class ConstructionTaskLink(models.Model):
    """A typed, lagged dependency between two project tasks (Primavera-style
    FS / SS / FF / SF relationships), richer than core's simple blocked-by."""

    _name = "construction.task.link"
    _description = "Task Dependency"

    predecessor_id = fields.Many2one(
        "project.task", required=True, ondelete="cascade", index=True
    )
    successor_id = fields.Many2one(
        "project.task", required=True, ondelete="cascade", index=True
    )
    link_type = fields.Selection(
        [
            ("FS", "Finish → Start"),
            ("SS", "Start → Start"),
            ("FF", "Finish → Finish"),
            ("SF", "Start → Finish"),
        ],
        default="FS",
        required=True,
        string="Type",
    )
    lag_days = fields.Integer(
        string="Lag (working days)",
        help="Positive delays the successor; negative allows overlap (lead).",
    )
    project_id = fields.Many2one(
        related="successor_id.project_id", store=True, index=True
    )
    display_name = fields.Char(compute="_compute_display_name")

    @api.depends("predecessor_id", "successor_id", "link_type", "lag_days")
    def _compute_display_name(self):
        for link in self:
            lag = ""
            if link.lag_days:
                lag = f" {link.lag_days:+d}d"
            link.display_name = (
                f"{link.predecessor_id.name or '?'} → "
                f"{link.successor_id.name or '?'} [{link.link_type}{lag}]"
            )

    @api.constrains("predecessor_id", "successor_id")
    def _check_link(self):
        for link in self:
            if link.predecessor_id == link.successor_id:
                raise ValidationError(
                    self.env._("A task cannot depend on itself.")
                )
            if link.predecessor_id.project_id != link.successor_id.project_id:
                raise ValidationError(
                    self.env._("Both tasks of a dependency must be in the same project.")
                )
            link._check_no_cycle()

    def _check_no_cycle(self):
        project = self.successor_id.project_id
        links = self.search([("project_id", "=", project.id)])
        task_ids = list(
            set(links.mapped("predecessor_id").ids)
            | set(links.mapped("successor_id").ids)
        )
        try:
            cpm.topological_order(
                task_ids,
                [(l.predecessor_id.id, l.successor_id.id) for l in links],
            )
        except ValueError:
            raise ValidationError(
                self.env._("This dependency would create a cycle in the schedule.")
            )
