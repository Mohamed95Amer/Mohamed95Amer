import base64
import io
import re

from odoo import fields, models
from odoo.exceptions import UserError


class ConstructionDrawingUpload(models.TransientModel):
    """Bulk-upload drawing PDFs.

    Each uploaded file becomes one drawing revision. Multi-page PDFs are split
    into one revision per page. Drawing number and revision are parsed from
    the filename when it follows '<NUMBER>_<REV>.pdf' (e.g. 'AR-101_B.pdf');
    otherwise the filename stem is used as the number with revision A.
    """

    _name = "construction.drawing.upload"
    _description = "Bulk Drawing Upload"

    project_id = fields.Many2one(
        "project.project",
        required=True,
        domain=[("is_construction", "=", True)],
    )
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
    split_pages = fields.Boolean(
        string="Split multi-page PDFs",
        default=True,
        help="Create one sheet per PDF page instead of one per file.",
    )
    file_ids = fields.Many2many("ir.attachment", string="PDF Files")

    FILENAME_RE = re.compile(r"^(?P<number>.+?)[_-][Rr]?(?P<rev>[A-Z0-9]{1,3})\.pdf$")

    def _parse_filename(self, filename):
        match = self.FILENAME_RE.match(filename or "")
        if match:
            return match.group("number"), match.group("rev")
        stem = re.sub(r"\.pdf$", "", filename or "sheet", flags=re.I)
        return stem, "A"

    def _split_pdf(self, data):
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) <= 1:
            return [data]
        pages = []
        for page in reader.pages:
            writer = PdfWriter()
            writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            pages.append(buf.getvalue())
        return pages

    def action_import(self):
        self.ensure_one()
        if not self.file_ids:
            raise UserError(self.env._("Upload at least one PDF file."))
        Drawing = self.env["construction.drawing"]
        Revision = self.env["construction.drawing.revision"]
        created = Revision.browse()
        for attachment in self.file_ids:
            number, rev = self._parse_filename(attachment.name)
            data = base64.b64decode(attachment.datas or b"")
            chunks = self._split_pdf(data) if self.split_pages else [data]
            for index, chunk in enumerate(chunks):
                sheet_number = (
                    number if len(chunks) == 1 else f"{number}-P{index + 1:02d}"
                )
                drawing = Drawing.search(
                    [
                        ("number", "=", sheet_number),
                        ("project_id", "=", self.project_id.id),
                    ],
                    limit=1,
                )
                if not drawing:
                    drawing = Drawing.create(
                        {
                            "name": sheet_number,
                            "number": sheet_number,
                            "project_id": self.project_id.id,
                        }
                    )
                page_attachment = self.env["ir.attachment"].create(
                    {
                        "name": f"{sheet_number}_Rev{rev}.pdf",
                        "datas": base64.b64encode(chunk),
                        "mimetype": "application/pdf",
                        "res_model": "construction.drawing",
                        "res_id": drawing.id,
                    }
                )
                created |= Revision.create(
                    {
                        "drawing_id": drawing.id,
                        "revision": rev,
                        "issued_for": self.issued_for,
                        "attachment_id": page_attachment.id,
                    }
                )
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Imported Revisions"),
            "res_model": "construction.drawing.revision",
            "view_mode": "list,form",
            "domain": [("id", "in", created.ids)],
        }
