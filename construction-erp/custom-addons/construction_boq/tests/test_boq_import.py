import base64
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
