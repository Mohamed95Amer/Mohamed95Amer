import base64
import hashlib
import io

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


def build_xlsx(rows):
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return base64.b64encode(buffer.getvalue())


HEADER = ["Section Code", "Section Name", "Item Code", "Description", "Unit",
          "Quantity", "Unit Rate", "Material", "Labour", "Equipment",
          "Subcontract", "Overhead"]


@tagged("post_install", "-at_install")
class TestBoqImport(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Import Test", "is_construction": True}
        )
        cls.boq = cls.env["construction.boq"].create(
            {"project_id": cls.project.id}
        )

    def _wizard(self, rows):
        return self.env["construction.boq.import"].create(
            {"boq_id": self.boq.id, "file": build_xlsx(rows), "filename": "boq.xlsx"}
        )

    def test_import_creates_sections_and_lines(self):
        wizard = self._wizard([
            HEADER,
            ["01", "Substructure", "01.010", "Excavation", "m³",
             1000, 15, 3, 5, 6, 0, 1],
            ["01", "Substructure", "01.020", "Raft", "m³",
             500, 400, 250, 60, 25, 0, 10],
            ["02", "Superstructure", "02.010", "Columns", "m³",
             300, 500, 300, 90, 30, 0, 0],
        ])
        action = wizard.action_import()
        self.assertEqual(action["params"]["type"], "success")
        self.assertEqual(len(self.boq.line_ids), 3)
        self.assertEqual(len(self.boq.section_ids), 2)
        line = self.boq.line_ids.filtered(lambda l: l.item_code == "01.010")
        self.assertEqual(line.quantity, 1000)
        self.assertEqual(line.unit_cost, 15)
        self.assertEqual(line.amount_sell, 15000)
        self.assertEqual(line.section_id.name, "Substructure")

    def test_bad_header_rejected(self):
        wizard = self._wizard([["Wrong", "Header"], ["x", "y"]])
        with self.assertRaises(UserError):
            wizard.action_import()

    def test_non_numeric_rejected(self):
        wizard = self._wizard([
            HEADER,
            ["01", "S", "1", "Item", "m", "abc", 10, 0, 0, 0, 0, 0],
        ])
        with self.assertRaises(UserError):
            wizard.action_import()

    def test_locked_boq_rejected(self):
        # About importing into a locked bill, not about approvals: the demo
        # rules would otherwise make this a test of the approval engine.
        self.env["construction.approval.rule"].search([]).write({"active": False})
        self.boq.action_approve()
        self.boq.action_lock()
        wizard = self._wizard([HEADER])
        with self.assertRaises(UserError):
            wizard.action_import()

    def test_oversized_upload_is_refused(self):
        """The whole file is decoded into memory before openpyxl sees it, so
        without a ceiling any user who can open this wizard can ask the server
        to allocate as much as they can upload."""
        self.env["ir.config_parameter"].sudo().set_param(
            "construction_boq.max_import_mb", "0.001")  # ~1KB
        wizard = self._wizard([
            HEADER,
            ["01", "S", "1", "Item", "m", 1, 1, 0, 0, 0, 0, 0],
        ])
        with self.assertRaises(UserError):
            wizard.action_import()

    def test_a_sane_limit_still_lets_a_real_bill_through(self):
        """A guard that refuses ordinary work is not a guard, it is an outage.
        Pinned so the default cannot be tightened into one by accident."""
        self.env["ir.config_parameter"].sudo().set_param(
            "construction_boq.max_import_mb", "25")
        wizard = self._wizard([
            HEADER,
            ["01", "S", "1", "Item", "m", 1, 1, 0, 0, 0, 0, 0],
        ])
        wizard.action_import()
        self.assertEqual(len(self.boq.line_ids), 1)

    def test_units_resolve_for_a_reader_whose_language_is_not_english(self):
        """uom.uom.name is translate=True and there is no stable code, so a
        lookup keyed on the translated name alone resolves differently
        depending on who is logged in — and silently, because an unmatched
        unit is left empty rather than raising.

        This fails against a lookup built only from the active language: the
        workbook says "Units" while the reader's language calls it something
        else, and the old code returned nothing.
        """
        unit = self.env.ref("uom.product_uom_unit")
        unit.with_context(lang="en_US").name = "Units"
        self.env["res.lang"]._activate_lang("ar_001")
        unit.with_context(lang="ar_001").name = "وحدة"

        arabic_reader = self.env["res.users"].create({
            "name": "Arabic QS",
            "login": "boq-import-ar",
            "lang": "ar_001",
            "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
        })
        wizard = self.env["construction.boq.import"].with_user(
            arabic_reader
        ).sudo().create({
            "boq_id": self.boq.id,
            "filename": "boq.xlsx",
            "file": build_xlsx([
                HEADER,
                ["01", "S", "1", "English workbook", "Units",
                 2, 10, 0, 0, 0, 0, 0],
                ["01", "S", "2", "Arabic workbook", "وحدة",
                 3, 10, 0, 0, 0, 0, 0],
            ]),
        })
        wizard.with_context(lang="ar_001").action_import()

        by_code = {line.item_code: line for line in self.boq.line_ids}
        self.assertEqual(by_code["1"].uom_id, unit,
                         "the English label did not resolve for an Arabic reader")
        self.assertEqual(by_code["2"].uom_id, unit,
                         "the reader's own label did not resolve")

    def test_the_import_is_recorded_against_the_bill(self):
        """An import rewrites the commercial basis of the job. The checksum is
        what makes the log entry worth having — a filename can be reused for a
        corrected workbook."""
        before = len(self.boq.message_ids)
        wizard = self._wizard([
            HEADER,
            ["01", "S", "1", "Item", "m", 1, 1, 0, 0, 0, 0, 0],
        ])
        wizard.action_import()

        self.assertEqual(len(self.boq.message_ids), before + 1)
        body = self.boq.message_ids[0].body
        self.assertIn("boq.xlsx", body)
        # sha256 of the exact bytes uploaded, so the entry identifies the file
        # rather than our reading of it.
        expected = hashlib.sha256(
            base64.b64decode(wizard.file)).hexdigest()
        self.assertIn(expected, body)

    def test_margin_fields(self):
        line = self.env["construction.boq.line"].create(
            {
                "boq_id": self.boq.id,
                "name": "Margin line",
                "quantity": 10,
                "unit_rate": 100,
                "cost_material": 60,
            }
        )
        self.assertEqual(line.margin_amount, 400)
        self.assertEqual(line.margin_percent, 40)
        line.qty_certified = 5
        self.assertEqual(line.amount_certified, 500)
        self.assertEqual(self.boq.percent_complete, 50)
