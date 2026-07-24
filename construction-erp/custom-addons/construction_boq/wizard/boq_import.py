import base64
import io

from odoo import fields, models
from odoo.exceptions import UserError

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
        rows = self._parse_rows(base64.b64decode(self.file))
        Section = self.env["construction.boq.section"]
        Line = self.env["construction.boq.line"]
        sections = {s.code: s for s in boq.section_ids if s.code}
        uoms = {
            u.name.lower(): u for u in self.env["uom.uom"].search([])
        }
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
            uom = uoms.get(str(unit or "").strip().lower())

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
                "uom_id": uom.id if uom else False,
                "quantity": num(qty),
                "unit_rate": num(rate),
                "cost_material": num(material),
                "cost_labour": num(labour),
                "cost_equipment": num(equipment),
                "cost_subcontract": num(subcontract),
                "cost_overhead": num(overhead),
            })
            created += 1
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
