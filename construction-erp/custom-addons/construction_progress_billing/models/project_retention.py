"""The retention position, on the project it belongs to.

"How much of our money is the client still holding, and when do we get it"
had no answer anywhere in the product. The figures existed — every
certificate carries its cumulative retention — but nothing put them next to
what had been released, which is the only comparison that matters.
"""

from odoo import api, fields, models


class ProjectRetention(models.Model):
    _inherit = "project.project"

    retention_release_ids = fields.One2many(
        "construction.retention.release", "project_id")
    retention_release_count = fields.Integer(
        compute="_compute_retention_position")
    retention_withheld = fields.Monetary(
        compute="_compute_retention_position", currency_field="currency_id",
        string="Retention Withheld",
        help="Cumulative retention withheld by certified payment "
             "certificates.")
    retention_released = fields.Monetary(
        compute="_compute_retention_position", currency_field="currency_id",
        string="Retention Released")
    retention_balance = fields.Monetary(
        compute="_compute_retention_position", currency_field="currency_id",
        string="Retention Outstanding",
        help="Still held by the client. This is the number to chase at "
             "taking-over and again at the end of the defects liability "
             "period.")

    @api.depends("retention_release_ids.amount_release",
                 "retention_release_ids.state")
    def _compute_retention_position(self):
        claim = self.env["construction.progress.claim"]
        for project in self:
            # Cumulative, so the latest certificate carries the whole figure —
            # summing them would count the same money once per certificate.
            latest = claim.search([
                ("project_id", "=", project.id),
                ("state", "in", ("certified", "invoiced", "paid")),
            ], order="sequence_no desc", limit=1)
            releases = project.retention_release_ids.filtered(
                lambda r: r.state in
                ("submitted", "approved", "invoiced", "paid"))
            withheld = latest.retention_cumulative or 0.0
            released = sum(releases.mapped("amount_release"))
            project.retention_withheld = withheld
            project.retention_released = released
            project.retention_balance = withheld - released
            project.retention_release_count = len(
                project.retention_release_ids)

    def action_view_retention_releases(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Retention — %s", self.display_name),
            "res_model": "construction.retention.release",
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.id)],
            "context": {"default_project_id": self.id},
        }
