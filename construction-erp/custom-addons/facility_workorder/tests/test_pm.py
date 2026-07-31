from datetime import date, timedelta

from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPreventiveMaintenance(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.asset = cls.env["maintenance.equipment"].create({"name": "AHU-9"})
        cls.job = cls.env["facility.job.plan"].create({
            "name": "Service", "estimated_duration": 2.0,
            "task_ids": [
                (0, 0, {"sequence": 10, "name": "Step 1"}),
                (0, 0, {"sequence": 20, "name": "Step 2"}),
            ],
        })
        cls.meter = cls.env["facility.asset.meter"].create(
            {"name": "Hours", "equipment_id": cls.asset.id, "uom": "hours"})
        cls.technician = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Checklist Technician",
            "login": "checklist-technician-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
        })
        cls.facility_manager = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Checklist Manager",
            "login": "checklist-manager-access@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(
                6,
                0,
                [cls.env.ref("maintenance.group_equipment_manager").id],
            )],
        })

    def _reading(self, value, day=None):
        self.env["facility.asset.meter.reading"].create({
            "meter_id": self.meter.id, "value": value,
            "date": day or date.today()})

    def _count(self, plan):
        return self.env["maintenance.request"].search_count(
            [("pm_plan_id", "=", plan.id)])

    def test_calendar_pm_generates_and_advances(self):
        plan = self.env["facility.pm.plan"].create({
            "name": "Cal", "equipment_id": self.asset.id,
            "job_plan_id": self.job.id, "trigger_type": "calendar",
            "interval_number": 1, "interval_type": "months",
            "next_date": date.today() - timedelta(days=1)})
        self.env["facility.pm.plan"]._cron_generate_pm()
        self.assertEqual(self._count(plan), 1)
        self.assertGreater(plan.next_date, date.today())
        # not generated again immediately
        self.env["facility.pm.plan"]._cron_generate_pm()
        self.assertEqual(self._count(plan), 1)

    def test_generated_request_has_checklist(self):
        plan = self.env["facility.pm.plan"].create({
            "name": "Cal2", "equipment_id": self.asset.id,
            "job_plan_id": self.job.id, "trigger_type": "calendar",
            "next_date": date.today()})
        plan.action_generate_now()
        req = self.env["maintenance.request"].search(
            [("pm_plan_id", "=", plan.id)], limit=1)
        self.assertEqual(req.maintenance_type, "preventive")
        self.assertEqual(len(req.checklist_ids), 2)
        self.assertEqual(req.labor_hours, 2.0)

    def test_meter_pm_triggers_on_threshold(self):
        self._reading(1000)
        plan = self.env["facility.pm.plan"].create({
            "name": "Meter", "equipment_id": self.asset.id,
            "job_plan_id": self.job.id, "trigger_type": "meter",
            "meter_id": self.meter.id, "meter_interval": 2000})
        # current 1000 < 0 + 2000 -> no trigger
        self.env["facility.pm.plan"]._cron_generate_pm()
        self.assertEqual(self._count(plan), 0)
        # advance meter to 2100 -> crosses 2000
        self._reading(2100)
        self.env["facility.pm.plan"]._cron_generate_pm()
        self.assertEqual(self._count(plan), 1)
        self.assertEqual(plan.last_triggered_value, 2100)
        # not triggered again until +2000 more
        self.env["facility.pm.plan"]._cron_generate_pm()
        self.assertEqual(self._count(plan), 1)

    def test_checklist_progress_and_costs(self):
        req = self.env["maintenance.request"].create({
            "name": "WO", "equipment_id": self.asset.id,
            "job_plan_id": self.job.id,
            "labor_hours": 3, "labor_rate": 50,
            "parts_cost": 120, "contractor_cost": 200})
        self.assertEqual(req.labor_cost, 150)
        self.assertEqual(req.total_cost, 470)
        self.assertEqual(len(req.checklist_ids), 2)
        self.assertEqual(req.checklist_progress, 0)
        req.checklist_ids[0].done = True
        self.assertEqual(req.checklist_progress, 50)

    def test_technician_updates_checklist_but_cannot_delete_it(self):
        request = self.env["maintenance.request"].create({
            "name": "Assigned checklist",
            "equipment_id": self.asset.id,
            "job_plan_id": self.job.id,
            "user_id": self.technician.id,
        })
        task = request.checklist_ids[0]
        task.with_user(self.technician).write({"done": True})
        self.assertTrue(task.done)
        with self.assertRaises(AccessError):
            task.with_user(self.technician).unlink()
        task.with_user(self.facility_manager).unlink()
        self.assertFalse(task.exists())
