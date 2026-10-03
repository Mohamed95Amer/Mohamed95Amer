from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionDefectFromInspection(models.Model):
    """Where a defect came from, when an inspection found it."""

    _inherit = "construction.defect"

    inspection_id = fields.Many2one(
        "construction.form.inspection",
        string="Raised by Inspection",
        readonly=True,
        index=True,
        ondelete="set null",
        help="Inspection whose failed check produced this defect.",
    )
    inspection_answer_id = fields.Many2one(
        "construction.form.answer",
        string="Failed Check",
        readonly=True,
        ondelete="set null",
        help="The specific check that failed, so one defect is raised per "
             "finding rather than one per inspection.",
    )


class ConstructionInspectionRaisesDefects(models.Model):
    """Turn a failed inspection into punch-list items.

    A failed check used to be a dead end: the answer sat in the form and
    somebody had to notice it and re-type it into the punch list — exactly the
    step that gets skipped on a busy site, which is how a quality system ends
    up recording problems nobody fixed. This carries the finding across in one
    click and keeps the defect attached to the check that produced it, so the
    inspection can be re-read months later and still explain itself.
    """

    _inherit = "construction.form.inspection"

    defect_ids = fields.One2many(
        "construction.defect", "inspection_id", string="Defects Raised")
    defect_count = fields.Integer(compute="_compute_defect_stats")
    failed_check_count = fields.Integer(
        compute="_compute_defect_stats",
        help="Yes/No checks answered 'No'.")
    unraised_check_count = fields.Integer(
        compute="_compute_defect_stats",
        help="Failed checks that have no defect yet.")

    @api.depends("defect_ids", "answer_ids.answer_yes_no")
    def _compute_defect_stats(self):
        for inspection in self:
            failed = inspection._failed_answers()
            raised = inspection.defect_ids.mapped("inspection_answer_id")
            inspection.defect_count = len(inspection.defect_ids)
            inspection.failed_check_count = len(failed)
            inspection.unraised_check_count = len(failed - raised)

    def _failed_answers(self):
        self.ensure_one()
        return self.answer_ids.filtered(
            lambda answer: answer.question_id.answer_type == "yes_no"
            and answer.answer_yes_no == "no"
        )

    def action_raise_defects(self):
        """Raise one defect per failed check that does not have one yet."""
        self.ensure_one()
        failed = self._failed_answers()
        if not failed:
            raise UserError(
                self.env._("This inspection has no failed checks to raise.")
            )
        outstanding = failed - self.defect_ids.mapped("inspection_answer_id")
        if not outstanding:
            raise UserError(self.env._(
                "Every failed check on this inspection already has a defect."
            ))

        defect_model = self.env["construction.defect"]
        created = defect_model
        for answer in outstanding:
            created |= defect_model.create({
                "name": answer.question_id.name,
                "project_id": self.project_id.id,
                "location": self.location,
                "description": answer.comment or self.env._(
                    "Raised from inspection %s.", self.name),
                "inspection_id": self.id,
                "inspection_answer_id": answer.id,
            })
        self.message_post(body=self.env._(
            "%s defect(s) raised from failed checks.", len(created)
        ))
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Defects Raised"),
            "res_model": "construction.defect",
            "view_mode": "list,form",
            "domain": [("id", "in", created.ids)],
        }

    def action_view_defects(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Defects"),
            "res_model": "construction.defect",
            "view_mode": "list,form",
            "domain": [("inspection_id", "=", self.id)],
            "context": {"default_project_id": self.project_id.id},
        }
