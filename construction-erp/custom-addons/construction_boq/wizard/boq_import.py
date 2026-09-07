import base64
import hashlib
import io

from odoo import fields, models
from odoo.exceptions import UserError

# Ceiling on the decoded upload, in megabytes. Overridable per database with
# the ir.config_parameter of the same name.
#
# There is a limit at all because the whole file is decoded into memory before
# openpyxl sees it, so without one any user who can open this wizard can ask
# the server to allocate as much as they can upload. 25MB is far above a real
# bill of quantities — the demo ones are a few kilobytes — and far below a
# figure that threatens the worker.
MAX_UPLOAD_MB = 25
MAX_UPLOAD_PARAM = "construction_boq.max_import_mb"

# Expected header row (case-insensitive, order fixed). Columns after
# "Unit Rate" are optional cost-breakdown columns.
HEADERS = [
    "section code", "section name", "item code", "description", "unit",
    "quantity", "unit rate", "material", "labour", "equipment",
    "subcontract", "overhead",
]


class ConstructionBoqImport(models.TransientModel):
    """Import BOQ lines (and their sections) from an XLSX file.

    Expected columns, first row as headers:
    Section Code | Section Name | Item Code | Description | Unit | Quantity |
    Unit Rate | Material | Labour | Equipment | Subcontract | Overhead
    """

    _name = "construction.boq.import"
    _description = "BOQ XLSX Import"

    boq_id = fields.Many2one("construction.boq", required=True)
    file = fields.Binary(string="XLSX File", required=True)
    filename = fields.Char()

    def _max_upload_bytes(self):
        raw = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param(MAX_UPLOAD_PARAM, MAX_UPLOAD_MB)
        )
        try:
            megabytes = float(raw)
        except (TypeError, ValueError):
            megabytes = MAX_UPLOAD_MB
        return int(megabytes * 1024 * 1024)

    def _uom_index(self):
        """Match unit labels in the user's language *and* in English.

        uom.uom has no stable code — name is the only label and it is
        translate=True. Keying the lookup on the translated name alone means
        the same workbook resolves different units depending on who is logged
        in, and silently: an unmatched unit is left empty rather than raising.
        So index both the source term and the user's own, and let either hit.
        """
        index = {}
        uoms = self.env["uom.uom"].search([])
        for record in uoms.with_context(lang="en_US"):
            key = (record.name or "").strip().lower()
            if key:
                index[key] = record.id
        for record in uoms:  # the reader's language wins on a collision
            key = (record.name or "").strip().lower()
            if key:
                index[key] = record.id
        return index

    def _parse_rows(self, data):
        try:
            import openpyxl
        except ImportError:
            raise UserError(self.env._("openpyxl is not installed on the server."))
        try:
            workbook = openpyxl.load_workbook(
                io.BytesIO(data), read_only=True, data_only=True
            )
        except Exception:
            raise UserError(self.env._(
                "Could not read the file. Upload an .xlsx workbook."
            ))
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            raise UserError(self.env._("The workbook is empty."))
        header = [str(c or "").strip().lower() for c in rows[0]]
        if header[:7] != HEADERS[:7]:
            raise UserError(self.env._(
                "Unexpected header row. Expected columns: %s",
                " | ".join(h.title() for h in HEADERS),
            ))
        return rows[1:]

    def action_import(self):
        self.ensure_one()
        boq = self.boq_id
        if boq.state == "locked":
            raise UserError(self.env._(
                "This BOQ is locked. Create a new revision first."
            ))
        data = base64.b64decode(self.file)
        ceiling = self._max_upload_bytes()
        if len(data) > ceiling:
            raise UserError(self.env._(
                "This file is %(size).1f MB. The import limit is %(limit).1f MB.",
                size=len(data) / (1024 * 1024),
                limit=ceiling / (1024 * 1024),
            ))
        # Taken before parsing, over the bytes actually received, so it
        # identifies the upload rather than our reading of it.
        checksum = hashlib.sha256(data).hexdigest()

        rows = self._parse_rows(data)
        Section = self.env["construction.boq.section"]
        Line = self.env["construction.boq.line"]
        sections = {s.code: s for s in boq.section_ids if s.code}
        uoms = self._uom_index()
        created = 0
        for index, row in enumerate(rows, start=2):
            row = list(row) + [None] * (len(HEADERS) - len(row))
            (sec_code, sec_name, item_code, description, unit, qty, rate,
             material, labour, equipment, subcontract, overhead) = row[:12]
            if not description:
                continue
            section = False
            if sec_code:
                sec_code = str(sec_code).strip()
                if sec_code not in sections:
                    sections[sec_code] = Section.create({
                        "boq_id": boq.id,
                        "code": sec_code,
                        "name": str(sec_name or sec_code).strip(),
                        "sequence": (len(sections) + 1) * 10,
                    })
                section = sections[sec_code]
            uom_id = uoms.get(str(unit or "").strip().lower())

            def num(value, row_index=index):
                if value in (None, ""):
                    return 0.0
                try:
                    return float(value)
                except (TypeError, ValueError):
                    raise UserError(self.env._(
                        "Row %(row)s contains a non-numeric value: %(val)r",
                        row=row_index, val=value,
                    ))

            Line.create({
                "boq_id": boq.id,
                "section_id": section.id if section else False,
                "item_code": str(item_code or "").strip() or False,
                "name": str(description).strip(),
                "uom_id": uom_id or False,
                "quantity": num(qty),
                "unit_rate": num(rate),
                "cost_material": num(material),
                "cost_labour": num(labour),
                "cost_equipment": num(equipment),
                "cost_subcontract": num(subcontract),
                "cost_overhead": num(overhead),
            })
            created += 1

        # An import rewrites the commercial basis of the job, so leave a
        # durable record of which file did it. The checksum is what makes the
        # entry worth anything: a filename can be reused for a corrected
        # workbook, and then the chatter says two imports were the same when
        # they were not.
        boq.message_post(body=self.env._(
            "Imported %(count)s lines from %(filename)s (SHA-256 %(checksum)s).",
            count=created,
            filename=self.filename or self.env._("an unnamed file"),
            checksum=checksum,
        ))
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": self.env._("BOQ import complete"),
                "message": self.env._(
                    "%(count)s lines imported into %(boq)s.",
                    count=created, boq=boq.name,
                ),
                "type": "success",
                "next": {"type": "ir.actions.client", "tag": "soft_reload"},
            },
        }
