from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionSubmittal(models.Model):
    _name = "construction.submittal"
    _description = "Submittal"
    _inherit = [
        "construction.document.mixin",
        "mail.thread",
        "mail.activity.mixin",
        "tier.validation",
    ]
    _doc_prefix = "SUB"
    _order = "id desc"
    _state_from = ["draft", "submitted"]
    _state_to = ["approved"]
    _tier_validation_manual_config = False

    submittal_type = fields.Selection(
        [
            ("shop_drawing", "Shop Drawing"),
            ("material", "Material Approval"),
            ("method", "Method Statement"),
            ("prequalification", "Prequalification"),
            ("other", "Other"),
        ],
        default="material",
        required=True,
    )
    spec_section = fields.Char(
        help="Specification section reference, e.g. 09 30 00 Tiling."
    )
    revision = fields.Char(default="A", required=True, readonly=True)
    previous_revision_id = fields.Many2one("construction.submittal", readonly=True)
    next_revision_id = fields.Many2one("construction.submittal", readonly=True)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("submitted", "Under Review"),
            ("approved", "Approved"),
            ("approved_as_noted", "Approved as Noted"),
            ("revise_resubmit", "Revise & Resubmit"),
            ("closed", "Closed"),
        ],
        default="draft",
        tracking=True,
        index=True,
    )
    review_comment = fields.Html(
        help="Reviewer's comments returned with the review decision."
    )
    attachment_ids = fields.Many2many(
        "ir.attachment", string="Submitted Documents"
    )
    subcontractor_id = fields.Many2one(
        "res.partner",
        string="Originating Subcontractor",
        help="Subcontractor/supplier that produced this submittal, if any.",
    )

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state in ("draft", "submitted")

    def action_submit(self):
        for submittal in self:
            if submittal.state != "draft":
                raise UserError(self.env._("Only draft submittals can be submitted."))
            if not submittal.ball_in_court_id:
                submittal.ball_in_court_id = submittal.project_id.consultant_id
            submittal.state = "submitted"
            submittal.request_validation()

    def action_approve(self):
        for submittal in self:
            if submittal.state != "submitted":
                raise UserError(
                    self.env._("Only submittals under review can be approved.")
                )
            # tier.validation blocks the transition into _state_to until all
            # tier reviews are accepted (see base_tier_validation).
            submittal.state = "approved"

    def action_approve_as_noted(self):
        for submittal in self:
            if submittal.state != "submitted":
                raise UserError(
                    self.env._("Only submittals under review can be approved.")
                )
            submittal.state = "approved_as_noted"

    def action_revise_resubmit(self):
        """Reject the current revision and spawn the next one."""
        next_revisions = self.browse()
        for submittal in self:
            if submittal.state != "submitted":
                raise UserError(
                    self.env._("Only submittals under review can be returned.")
                )
            submittal.state = "revise_resubmit"
            next_rev = submittal.copy(
                {
                    "revision": chr(ord(submittal.revision[0]) + 1)
                    if submittal.revision and submittal.revision[0] < "Z"
                    else f"{submittal.revision}+",
                    "previous_revision_id": submittal.id,
                    "state": "draft",
                    "review_comment": False,
                    "reference": False,
                }
            )
            submittal.next_revision_id = next_rev
            next_revisions |= next_rev
        return next_revisions

    def action_close(self):
        for submittal in self:
            if submittal.state not in ("approved", "approved_as_noted"):
                raise UserError(self.env._("Only approved submittals can be closed."))
            submittal.state = "closed"
