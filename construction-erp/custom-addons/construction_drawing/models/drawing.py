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

    def action_compare_revisions(self):
        """Open the two newest revisions from the drawing itself.

        The compare feature used to be reachable only from a tiny button on a
        revision row.  A drawing-level action is both discoverable and gives a
        deterministic default pair while preserving the revision pickers in
        the compare screen.
        """
        self.ensure_one()
        revisions = self.revision_ids.sorted(key=lambda revision: revision.id)
        if len(revisions) < 2:
            raise UserError(
                self.env._("Upload at least two revisions before comparing them.")
            )
        return revisions[-1].action_compare_revisions()


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

    # ------------------------------------------------------------------
    # Comparing two revisions
    # ------------------------------------------------------------------
    def _previous_revision(self):
        """The revision this one replaced, or an empty recordset.

        Ordered by id rather than by the revision letter. Revisions are
        Char — real projects issue "A", "B", "C1", "P2", and any attempt to
        sort those as versions gets it wrong on somebody's numbering scheme.
        The order they were issued in is what the register actually knows.
        """
        self.ensure_one()
        return self.search([
            ("drawing_id", "=", self.drawing_id.id),
            ("id", "<", self.id),
        ], order="id desc", limit=1)

    def action_compare_revisions(self):
        """Open this revision beside the one before it.

        Two sheets side by side rather than a computed diff: a drawing is a
        picture, and what changed on it is a thing an engineer sees and a
        pixel comparison of two independently generated PDFs does not — the
        same sheet replotted moves every line by a fraction and would light
        up entirely.
        """
        self.ensure_one()
        return {
            "type": "ir.actions.client",
            "tag": "construction_revision_compare",
            "name": self.env._("Compare Revisions"),
            "params": {
                "drawing_id": self.drawing_id.id,
                "right_id": self.id,
                "left_id": self._previous_revision().id or self.id,
            },
        }

    @api.model
    def get_compare_data(self, drawing_id):
        """Everything the compare screen needs, in one call.

        The viewer needs the sheet list to populate both pickers, and each
        entry has to carry its attachment so switching a pane does not cost
        another round trip on a screen whose whole purpose is flipping
        between revisions.
        """
        drawing = self.env["construction.drawing"].browse(drawing_id)
        drawing.check_access("read")
        revisions = self.search(
            [("drawing_id", "=", drawing.id)], order="id desc")
        return {
            "drawing": {
                "id": drawing.id,
                "number": drawing.number or "",
                "name": drawing.name or "",
            },
            "revisions": [
                {
                    "id": revision.id,
                    "label": revision.display_name or "",
                    "revision": revision.revision or "",
                    "issue_date": revision.issue_date or "",
                    "issued_for": revision.issued_for or "",
                    "state": revision.state,
                    "attachment_id": revision.attachment_id.id or False,
                }
                for revision in revisions
            ],
        }

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
