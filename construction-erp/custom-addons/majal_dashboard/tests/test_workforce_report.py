from odoo import fields
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestWorkforceReport(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.employee = cls.env["hr.employee"].create({
            "name": "Utilisation Tester",
            "company_id": cls.env.company.id,
        })
        cls.project = cls.env["project.project"].create({
            "name": "Utilisation Project",
            "is_construction": True,
            "company_id": cls.env.company.id,
        })
        cls.allocations = cls.env["majal.allocation"]
        cls.engineer = cls.env.ref("majal_workforce.role_site_engineer")
        cls.foreman = cls.env.ref("majal_workforce.role_foreman")
        today = fields.Date.today()
        cls.allocations.create({
            "employee_id": cls.employee.id,
            "project_id": cls.project.id,
            "role_id": cls.engineer.id,
            "date_start": today,
            "allocation_percent": 60,
        })
        cls.allocations.create({
            "employee_id": cls.employee.id,
            "project_id": cls.project.id,
            "role_id": cls.foreman.id,
            "date_start": today,
            "allocation_percent": 80,
        })

    def test_report_has_a_concrete_current_utilisation_measure(self):
        row = self.env["majal.workforce.report"].search([
            ("employee_id", "=", self.employee.id),
        ])
        self.assertEqual(len(row), 1)
        self.assertEqual(row.allocation_count, 2)
        self.assertEqual(row.utilization_percent, 140.0)
        self.assertEqual(row.available_percent, 0.0)
        self.assertTrue(row.is_overallocated)

    def test_future_allocations_do_not_change_today_measure(self):
        self.allocations.create({
            "employee_id": self.employee.id,
            "project_id": self.project.id,
            "role_id": self.env.ref("majal_workforce.role_quantity_surveyor").id,
            "date_start": fields.Date.add(fields.Date.today(), days=30),
            "allocation_percent": 50,
        })
        row = self.env["majal.workforce.report"].search([
            ("employee_id", "=", self.employee.id),
        ])
        self.assertEqual(row.allocation_count, 2)
        self.assertEqual(row.utilization_percent, 140.0)
