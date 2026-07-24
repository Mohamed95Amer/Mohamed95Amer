from odoo import _, api, fields, models
from odoo.exceptions import UserError


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

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("approved", "rejected", "closed")

    def action_submit(self):
        for record in self:
            if record.state not in ("draft", "rejected"):
                raise UserError(_("Only draft or rejected documents can be submitted."))
            record.write(
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
        self.filtered(lambda record: record.state == "submitted").state = "under_review"

    def action_approve(self):
        for record in self:
            if record.state not in ("submitted", "under_review"):
                raise UserError(_("Only submitted documents can be approved."))
            record.write(
                {
                    "state": "approved",
                    "approved_by_id": self.env.user.id,
                    "approved_date": fields.Datetime.now(),
                    "ball_in_court_id": False,
                }
            )

    def action_reject(self):
        for record in self:
            if record.state not in ("submitted", "under_review"):
                raise UserError(_("Only submitted documents can be returned."))
            record.write(
                {
                    "state": "rejected",
                    "approved_by_id": False,
                    "approved_date": False,
                    "ball_in_court_id": record.submitted_by_id.partner_id.id,
                }
            )

    def action_close(self):
        self.filtered(lambda record: record.state == "approved").state = "closed"

    def action_reset_draft(self):
        self.filtered(lambda record: record.state in ("rejected", "closed")).state = "draft"


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


class ConstructionDrawingRevision(models.Model):
    _name = "construction.drawing.revision"
    _description = "Drawing Revision"
    _inherit = ["construction.drawing.revision", "mail.thread", "mail.activity.mixin"]

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

    def action_submit_approval(self):
        for revision in self:
            if revision.approval_state not in ("draft", "rejected"):
                raise UserError(_("Only draft or returned revisions can be submitted."))
            if not revision.attachment_id:
                raise UserError(_("Upload the drawing PDF before requesting sign-off."))
            revision.write(
                {
                    "approval_state": "submitted",
                    "submitted_by_id": self.env.user.id,
                    "submitted_date": fields.Datetime.now(),
                }
            )

    def action_approve_revision(self):
        for revision in self:
            if revision.approval_state != "submitted":
                raise UserError(_("Only submitted revisions can be signed off."))
            revision.write(
                {
                    "approval_state": "approved",
                    "approved_by_id": self.env.user.id,
                    "approved_date": fields.Datetime.now(),
                }
            )

    def action_reject_revision(self):
        self.filtered(lambda revision: revision.approval_state == "submitted").write(
            {"approval_state": "rejected", "approved_by_id": False, "approved_date": False}
        )

    def action_reset_approval(self):
        self.filtered(lambda revision: revision.approval_state == "rejected").approval_state = "draft"

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
