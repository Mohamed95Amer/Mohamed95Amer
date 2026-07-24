import base64

from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionDrawing(models.Model):
    _name = "construction.drawing"
    _description = "Drawing"
    _inherit = ["mail.thread"]
    _order = "project_id, number"

    name = fields.Char(string="Title", required=True)
    number = fields.Char(string="Drawing Number", required=True)
    project_id = fields.Many2one(
        "project.project",
        required=True,
        ondelete="restrict",
        domain=[("is_construction", "=", True)],
        index=True,
    )
    discipline = fields.Selection(
        [
            ("architectural", "Architectural"),
            ("structural", "Structural"),
            ("mechanical", "Mechanical"),
            ("electrical", "Electrical"),
            ("plumbing", "Plumbing/Drainage"),
            ("civil", "Civil"),
            ("landscape", "Landscape"),
            ("other", "Other"),
        ],
        default="architectural",
    )
    revision_ids = fields.One2many(
        "construction.drawing.revision", "drawing_id", copy=False
    )
    current_revision_id = fields.Many2one(
        "construction.drawing.revision",
        compute="_compute_current_revision",
        store=True,
    )
    revision_count = fields.Integer(compute="_compute_revision_count")

    _sql_constraints = [
        (
            "number_project_uniq",
            "unique(number, project_id)",
            "Drawing number must be unique within a project.",
        ),
    ]

    @api.depends("revision_ids.state")
    def _compute_current_revision(self):
        for drawing in self:
            drawing.current_revision_id = drawing.revision_ids.filtered(
                lambda r: r.state == "current"
            )[:1]

    def _compute_revision_count(self):
        for drawing in self:
            drawing.revision_count = len(drawing.revision_ids)


class ConstructionDrawingRevision(models.Model):
    _name = "construction.drawing.revision"
    _description = "Drawing Revision"
    _order = "drawing_id, id desc"
    _rec_name = "display_name"

    drawing_id = fields.Many2one(
        "construction.drawing", required=True, ondelete="cascade", index=True
    )
    project_id = fields.Many2one(related="drawing_id.project_id", store=True)
    revision = fields.Char(required=True, default="A")
    issue_date = fields.Date(default=fields.Date.context_today)
    issued_for = fields.Selection(
        [
            ("tender", "Tender"),
            ("approval", "Approval"),
            ("construction", "Construction"),
            ("asbuilt", "As-Built"),
        ],
        default="construction",
        required=True,
    )
    attachment_id = fields.Many2one(
        "ir.attachment",
        string="PDF Attachment",
        ondelete="restrict",
        help="The sheet PDF for this revision.",
    )
    sheet_file = fields.Binary(
        compute="_compute_sheet_file",
        inverse="_inverse_sheet_file",
        string="Sheet PDF",
        attachment=False,
        help="Upload the sheet PDF here — it is stored as the revision's "
        "attachment and rendered by the plan viewer.",
    )
    sheet_filename = fields.Char()
    has_sheet = fields.Boolean(compute="_compute_has_sheet")

    @api.depends("attachment_id")
    def _compute_sheet_file(self):
        for rev in self:
            rev.sheet_file = rev.attachment_id.datas

    @api.depends("attachment_id")
    def _compute_has_sheet(self):
        for rev in self:
            rev.has_sheet = bool(rev.attachment_id)

    def _inverse_sheet_file(self):
        for rev in self:
            old = rev.attachment_id
            if rev.sheet_file:
                rev._check_pdf(base64.b64decode(rev.sheet_file))
                attachment = self.env["ir.attachment"].create(
                    {
                        "name": rev.sheet_filename
                        or f"{rev.display_name or 'sheet'}.pdf",
                        "datas": rev.sheet_file,
                        "mimetype": "application/pdf",
                        "res_model": rev._name,
                        "res_id": rev.id,
                    }
                )
                rev.attachment_id = attachment
            else:
                rev.attachment_id = False
            if old and old != rev.attachment_id:
                old.sudo().unlink()

    @api.model
    def _check_pdf(self, data):
        if not data.startswith(b"%PDF"):
            raise UserError(
                self.env._("Only PDF files can be uploaded as drawing sheets.")
            )

    def upload_sheet(self, filename, data_b64):
        """RPC used by the plan viewer's Upload button."""
        self.ensure_one()
        self.write(
            {"sheet_filename": filename or "sheet.pdf", "sheet_file": data_b64}
        )
        return {"attachment_id": self.attachment_id.id}
    state = fields.Selection(
        [("current", "Current"), ("superseded", "Superseded")],
        default="current",
        required=True,
    )
    display_name = fields.Char(compute="_compute_display_name", store=True)

    _sql_constraints = [
        (
            "revision_uniq",
            "unique(drawing_id, revision)",
            "This revision already exists for the drawing.",
        ),
    ]

    @api.depends("drawing_id.number", "revision")
    def _compute_display_name(self):
        for rev in self:
            rev.display_name = f"{rev.drawing_id.number or ''} Rev.{rev.revision or ''}"

    @api.model_create_multi
    def create(self, vals_list):
        revisions = super().create(vals_list)
        # A newly issued revision supersedes all other revisions of the drawing.
        for rev in revisions:
            if rev.state == "current":
                (rev.drawing_id.revision_ids - rev).filtered(
                    lambda r: r.state == "current"
                ).state = "superseded"
        return revisions

    def action_make_current(self):
        for rev in self:
            if rev.state == "current":
                continue
            others = rev.drawing_id.revision_ids - rev
            others.filtered(lambda r: r.state == "current").state = "superseded"
            rev.state = "current"

    def unlink(self):
        for rev in self:
            if rev.state == "current" and len(rev.drawing_id.revision_ids) > 1:
                raise UserError(
                    self.env._(
                        "Cannot delete the current revision while superseded "
                        "revisions exist. Make another revision current first."
                    )
                )
        return super().unlink()
