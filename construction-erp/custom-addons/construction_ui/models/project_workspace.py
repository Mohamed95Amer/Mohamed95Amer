from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError


class MajalProjectDocument(models.Model):
    _name = "majal.project.document"
    _description = "Majal Project Document"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "PDC"
    _order = "date_document desc, id desc"

    document_type = fields.Selection(
        [
            ("tender", "Tender Paper"),
            ("bid_request", "Bidding Request"),
            ("quotation", "Quotation"),
            ("sales_order", "Sales Order"),
            ("contract", "Contract"),
            ("permit", "Permit / Authority"),
            ("general", "General Document"),
        ],
        required=True,
        default="general",
        tracking=True,
    )
    partner_id = fields.Many2one("res.partner", string="Related Party", tracking=True)
    date_document = fields.Date(
        string="Document Date", default=fields.Date.context_today, required=True
    )
    amount = fields.Monetary(tracking=True)
    currency_id = fields.Many2one(
        "res.currency", related="project_id.currency_id", store=True
    )
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("submitted", "Submitted"),
            ("under_review", "Under Review"),
            ("approved", "Approved"),
            ("rejected", "Rejected"),
            ("closed", "Closed"),
        ],
        default="draft",
        required=True,
        tracking=True,
    )
    attachment_ids = fields.Many2many(
        "ir.attachment",
        "majal_project_document_attachment_rel",
        "document_id",
        "attachment_id",
        string="Files & Attachments",
    )
    description = fields.Html()
    submitted_by_id = fields.Many2one("res.users", readonly=True)
    submitted_date = fields.Datetime(readonly=True)
    approver_id = fields.Many2one("res.users", tracking=True)
    approved_by_id = fields.Many2one("res.users", readonly=True)
    approved_date = fields.Datetime(readonly=True)
    decision_note = fields.Text()

    _decision_fields = {
        "state",
        "submitted_by_id",
        "submitted_date",
        "approved_by_id",
        "approved_date",
        "decision_note",
    }
    _controlled_content_fields = {
        "name",
        "document_type",
        "partner_id",
        "date_document",
        "amount",
        "attachment_ids",
        "description",
        "project_id",
    }

    def write(self, vals):
        if (
            self._decision_fields & set(vals)
            and not self.env.context.get("majal_document_transition")
            and not self.env.su
        ):
            raise AccessError(
                _("Document decisions can only be changed through workflow actions.")
            )
        if (
            self._controlled_content_fields & set(vals)
            and not self.env.context.get("majal_document_transition")
            and any(record.state not in ("draft", "rejected") for record in self)
        ):
            raise UserError(
                _("Return this document to draft or create a revision before editing it.")
            )
        return super().write(vals)

    def unlink(self):
        if any(record.state != "draft" for record in self) and not self.env.su:
            raise UserError(_("Submitted project documents cannot be deleted."))
        return super().unlink()

    def _check_named_approver(self):
        for record in self:
            if record.approver_id and record.approver_id != self.env.user:
                raise AccessError(
                    _("Only %s can decide this document.") % record.approver_id.name
                )
            if not record.approver_id and not self.env.user.has_group(
                "construction_base.group_construction_pm"
            ):
                raise AccessError(
                    _("A Project Manager or the named approver must decide this document.")
                )
            if record.submitted_by_id == self.env.user:
                raise AccessError(
                    _("The person who submitted a document cannot approve it.")
                )

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("approved", "rejected", "closed")

    def action_submit(self):
        for record in self:
            if record.state not in ("draft", "rejected"):
                raise UserError(_("Only draft or rejected documents can be submitted."))
            record.with_context(majal_document_transition=True).write(
                {
                    "state": "submitted",
                    "submitted_by_id": self.env.user.id,
                    "submitted_date": fields.Datetime.now(),
                    "ball_in_court_id": record.approver_id.partner_id.id
                    if record.approver_id
                    else record.project_id.consultant_id.id,
                }
            )

    def action_review(self):
        records = self.filtered(lambda record: record.state == "submitted")
        records._check_named_approver()
        records.with_context(majal_document_transition=True).write(
            {"state": "under_review"}
        )

    def action_approve(self):
        self._check_named_approver()
        for record in self:
            if record.state not in ("submitted", "under_review"):
                raise UserError(_("Only submitted documents can be approved."))
            record.with_context(majal_document_transition=True).write(
                {
                    "state": "approved",
                    "approved_by_id": self.env.user.id,
                    "approved_date": fields.Datetime.now(),
                    "ball_in_court_id": False,
                }
            )

    def action_reject(self):
        self._check_named_approver()
        for record in self:
            if record.state not in ("submitted", "under_review"):
                raise UserError(_("Only submitted documents can be returned."))
            record.with_context(majal_document_transition=True).write(
                {
                    "state": "rejected",
                    "approved_by_id": False,
                    "approved_date": False,
                    "ball_in_court_id": record.submitted_by_id.partner_id.id,
                }
            )

    def action_close(self):
        if not self.env.user.has_group("construction_base.group_construction_pm"):
            raise AccessError(_("Only a Project Manager can close documents."))
        self.filtered(lambda record: record.state == "approved").with_context(
            majal_document_transition=True
        ).write({"state": "closed"})

    def action_reset_draft(self):
        if not self.env.user.has_group("construction_base.group_construction_pm"):
            raise AccessError(_("Only a Project Manager can reset documents."))
        self.filtered(lambda record: record.state in ("rejected", "closed")).with_context(
            majal_document_transition=True
        ).write({"state": "draft"})


class ProjectProject(models.Model):
    _inherit = "project.project"

    majal_document_ids = fields.One2many(
        "majal.project.document", "project_id", string="Documents & Commercial"
    )
    drawing_ids = fields.One2many("construction.drawing", "project_id")
    boq_ids = fields.One2many("construction.boq", "project_id")
    form_inspection_ids = fields.One2many(
        "construction.form.inspection", "project_id", string="Site Forms"
    )
    defect_ids = fields.One2many("construction.defect", "project_id")
    rfi_ids = fields.One2many("construction.rfi", "project_id")
    submittal_ids = fields.One2many("construction.submittal", "project_id")

    majal_document_count = fields.Integer(compute="_compute_majal_workspace_counts")
    drawing_count = fields.Integer(compute="_compute_majal_workspace_counts")
    boq_count = fields.Integer(compute="_compute_majal_workspace_counts")
    site_form_count = fields.Integer(compute="_compute_majal_workspace_counts")
    quality_item_count = fields.Integer(compute="_compute_majal_workspace_counts")
    engineering_item_count = fields.Integer(compute="_compute_majal_workspace_counts")

    def _compute_majal_workspace_counts(self):
        models_to_count = {
            "documents": ("majal.project.document", []),
            "drawings": ("construction.drawing", []),
            "boqs": ("construction.boq", []),
            "forms": ("construction.form.inspection", []),
            "defects": ("construction.defect", []),
            "rfis": ("construction.rfi", []),
            "submittals": ("construction.submittal", []),
        }
        for project in self:
            counts = {
                key: self.env[model].search_count([("project_id", "=", project.id)] + domain)
                for key, (model, domain) in models_to_count.items()
            }
            project.majal_document_count = counts["documents"]
            project.drawing_count = counts["drawings"]
            project.boq_count = counts["boqs"]
            project.site_form_count = counts["forms"]
            project.quality_item_count = counts["forms"] + counts["defects"] + counts["submittals"]
            project.engineering_item_count = counts["drawings"] + counts["rfis"] + counts["submittals"]

    def _majal_open_records(self, model, name, context=None):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": name,
            "res_model": model,
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.id)],
            "context": {
                "default_project_id": self.id,
                **(context or {}),
            },
        }

    def action_majal_documents(self):
        return self._majal_open_records(
            "majal.project.document", _("Documents & Commercial")
        )

    def action_majal_drawings(self):
        return self._majal_open_records("construction.drawing", _("Drawings"))

    def action_majal_boqs(self):
        return self._majal_open_records("construction.boq", _("BOQs & Estimates"))

    def action_majal_site_forms(self):
        return self._majal_open_records(
            "construction.form.inspection", _("Site Forms & Inspections")
        )

    def action_majal_quality(self):
        return self._majal_open_records("construction.defect", _("Quality & Snags"))

    def action_majal_engineering(self):
        return self._majal_open_records("construction.submittal", _("Engineering Approvals"))


# A value the caller cannot forge.
#
# This guard used to stand down for `majal_drawing_transition=True` in the
# context. Context travels with an RPC call, so anybody holding write access
# on a drawing revision could set that key and write approval_state or
# replace a submitted sheet directly — the same hole that was closed on
# construction.approvable by WORKFLOW_TRANSITION in approval_mixin.py,
# arriving by a second door on a model that mixin does not cover.
#
# RPC can only deliver JSON, so a context value can never be *identical* to a
# private Python object. Internal transition code imports this and passes
# it; a remote caller can send the string, the number or the boolean and
# none of them are this object.
DRAWING_TRANSITION = object()


class ConstructionDrawingRevision(models.Model):
    _name = "construction.drawing.revision"
    _description = "Drawing Revision"
    _inherit = ["construction.drawing.revision", "mail.thread", "mail.activity.mixin"]

    # A revision arrives superseded and is promoted to current only by
    # action_make_current below, which refuses until it has been signed off.
    # That is the point of this layer: an unsigned drawing must not silently
    # become the one the site is building to.
    state = fields.Selection(default="superseded")
    approval_state = fields.Selection(
        [
            ("draft", "Draft"),
            ("submitted", "Submitted for Sign-off"),
            ("approved", "Signed Off"),
            ("rejected", "Returned"),
        ],
        default="draft",
        required=True,
        tracking=True,
    )
    approver_id = fields.Many2one("res.users", string="Sign-off By", tracking=True)
    submitted_by_id = fields.Many2one("res.users", readonly=True)
    submitted_date = fields.Datetime(readonly=True)
    approved_by_id = fields.Many2one("res.users", readonly=True)
    approved_date = fields.Datetime(readonly=True)
    approval_note = fields.Text(string="Review / Sign-off Note")

    _approval_decision_fields = {
        "approval_state",
        "submitted_by_id",
        "submitted_date",
        "approved_by_id",
        "approved_date",
    }

    def write(self, vals):
        if (
            self._approval_decision_fields & set(vals)
            and not self.env.su
            and self.env.context.get("majal_drawing_transition") is not DRAWING_TRANSITION
        ):
            raise AccessError(
                _("Drawing sign-off can only be changed through workflow actions.")
            )
        if (
            {"attachment_id", "sheet_file"} & set(vals)
            and self.env.context.get("majal_drawing_transition") is not DRAWING_TRANSITION
            and any(revision.approval_state not in ("draft", "rejected") for revision in self)
        ):
            raise UserError(
                _("Create a new drawing revision instead of replacing a submitted sheet.")
            )
        return super().write(vals)

    def unlink(self):
        if (
            any(revision.approval_state != "draft" for revision in self)
            and not self.env.su
        ):
            raise UserError(_("Submitted drawing revisions cannot be deleted."))
        return super().unlink()

    def _check_signoff_authority(self):
        for revision in self:
            if revision.approver_id and revision.approver_id != self.env.user:
                raise AccessError(
                    _("Only %s can sign off this drawing.") % revision.approver_id.name
                )
            if not revision.approver_id and not self.env.user.has_group(
                "construction_base.group_construction_pm"
            ):
                raise AccessError(
                    _("A Project Manager or the named approver must sign off this drawing.")
                )
            if revision.submitted_by_id == self.env.user:
                raise AccessError(
                    _("The person who submitted a drawing cannot sign it off.")
                )

    def action_submit_approval(self):
        for revision in self:
            if revision.approval_state not in ("draft", "rejected"):
                raise UserError(_("Only draft or returned revisions can be submitted."))
            if not revision.attachment_id:
                raise UserError(_("Upload the drawing PDF before requesting sign-off."))
            revision.with_context(majal_drawing_transition=DRAWING_TRANSITION).write(
                {
                    "approval_state": "submitted",
                    "submitted_by_id": self.env.user.id,
                    "submitted_date": fields.Datetime.now(),
                }
            )

    def action_approve_revision(self):
        self._check_signoff_authority()
        for revision in self:
            if revision.approval_state != "submitted":
                raise UserError(_("Only submitted revisions can be signed off."))
            revision.with_context(majal_drawing_transition=DRAWING_TRANSITION).write(
                {
                    "approval_state": "approved",
                    "approved_by_id": self.env.user.id,
                    "approved_date": fields.Datetime.now(),
                }
            )

    def action_reject_revision(self):
        records = self.filtered(lambda revision: revision.approval_state == "submitted")
        records._check_signoff_authority()
        records.with_context(majal_drawing_transition=DRAWING_TRANSITION).write(
            {"approval_state": "rejected", "approved_by_id": False, "approved_date": False}
        )

    def action_reset_approval(self):
        if not self.env.user.has_group("construction_base.group_construction_pm"):
            raise AccessError(_("Only a Project Manager can reset drawing sign-off."))
        self.filtered(lambda revision: revision.approval_state == "rejected").with_context(
            majal_drawing_transition=DRAWING_TRANSITION
        ).write({"approval_state": "draft"})

    def action_make_current(self):
        if any(revision.approval_state != "approved" for revision in self):
            raise UserError(_("Only signed-off revisions can be published as current."))
        return super().action_make_current()

    def action_open_revision(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.display_name,
            "res_model": self._name,
            "res_id": self.id,
            "view_mode": "form",
            "target": "current",
        }
