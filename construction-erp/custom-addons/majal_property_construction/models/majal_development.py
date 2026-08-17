from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalDevelopment(models.Model):
    _inherit = "majal.development"

    project_id = fields.Many2one(
        "project.project", string="Construction Project", tracking=True,
        domain="[('is_construction', '=', True)]",
        help="The construction project delivering this development.")
    project_stage = fields.Selection(
        related="project_id.construction_stage", readonly=True)
    project_taking_over_date = fields.Date(
        related="project_id.date_taking_over", readonly=True,
        string="Construction Taking-Over Date")

    def action_pull_handover_date(self):
        """Adopt the construction taking-over date as the property-side
        expected handover date, and move the money that follows it."""
        for development in self:
            if not development.project_id:
                raise UserError(
                    self.env._(
                        "%s is not linked to a construction project.",
                        development.display_name,
                    )
                )
            taking_over = development.project_id.date_taking_over
            if not taking_over:
                raise UserError(
                    self.env._(
                        "%s has no taking-over date set yet.",
                        development.project_id.display_name,
                    )
                )
            development.expected_handover_date = taking_over
            development._reschedule_handover_installments(taking_over)
        return True

    def _reschedule_handover_installments(self, handover_date):
        """Move every unpaid handover-linked installment to the new date.

        Paid installments are left alone: the date on a payment that has
        already been made is a record of what happened, not a plan.
        """
        self.ensure_one()
        installments = self.env["majal.payment.installment"].search([
            ("reservation_id.development_id", "=", self.id),
            ("trigger", "=", "handover"),
            ("state", "!=", "paid"),
        ])
        if installments:
            installments.write({"due_date": handover_date})
        return installments
