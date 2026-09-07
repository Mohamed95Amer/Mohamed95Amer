from dateutil.relativedelta import relativedelta

from odoo import Command, fields
from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityContract(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.today = fields.Date.context_today(cls.env["contract.contract"])
        cls.start = cls.today - relativedelta(months=3)
        cls.client = cls.env["res.partner"].create({"name": "Tower Owners"})
        cls.service = cls.env["product.product"].create({
            "name": "AMC monthly fee", "type": "service", "list_price": 1000.0,
        })
        cls.chiller = cls.env["maintenance.equipment"].create({
            "name": "Chiller CH-01", "criticality": "critical",
        })
        cls.lift = cls.env["maintenance.equipment"].create({"name": "Lift L-01"})
        cls.sla_contract = cls.env["facility.sla.policy"].create({
            "name": "Contract cover — 1h/4h",
            "sequence": 50,
            "response_hours": 1.0,
            "resolution_hours": 4.0,
        })
        cls.contract = cls.env["contract.contract"].create({
            "name": "HVAC AMC",
            "partner_id": cls.client.id,
            "contract_type": "sale",
            "line_recurrence": False,
            "is_amc": True,
            "sla_policy_id": cls.sla_contract.id,
            "pm_visits_included": 12,
            "equipment_ids": [(6, 0, [cls.chiller.id])],
            "date_start": cls.start,
            "recurring_next_date": cls.today,
            "date_end": cls.today + relativedelta(months=9),
            "contract_line_ids": [(0, 0, {
                "product_id": cls.service.id,
                "name": "Monthly HVAC maintenance",
                "quantity": 1.0,
                "price_unit": 1000.0,
                "date_start": cls.start,
                "recurring_next_date": cls.today,
            })],
        })
        cls.contract_line = cls.contract.contract_line_ids
        cls.facility_manager = cls.env["res.users"].with_context(
            no_reset_password=True
        ).create({
            "name": "Facilities Contract Manager",
            "login": "facilities-contract-manager@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [Command.set(cls.env.company.ids)],
            "groups_id": [Command.set([
                cls.env.ref("base.group_user").id,
                cls.env.ref("maintenance.group_equipment_manager").id,
            ])],
        })

    def _request(self, equipment=None, maintenance_type="corrective", **vals):
        values = {
            "name": "Not cooling",
            "equipment_id": (equipment or self.chiller).id,
            "maintenance_type": maintenance_type,
        }
        values.update(vals)
        return self.env["maintenance.request"].create(values)

    def _invoice(self, quantity, post=True):
        invoice = self.env["account.move"].create({
            "move_type": "out_invoice",
            "partner_id": self.client.id,
            "invoice_date": self.today,
            "invoice_line_ids": [(0, 0, {
                "product_id": self.service.id,
                "quantity": quantity,
                "price_unit": 1000.0,
                "contract_line_id": self.contract_line.id,
            })],
        })
        if post:
            invoice.action_post()
        return invoice

    # ------------------------------------------------------------------
    # Matching
    # ------------------------------------------------------------------
    def test_work_on_a_covered_asset_finds_its_contract(self):
        request = self._request()
        self.assertEqual(request.facility_contract_id, self.contract)
        self.assertTrue(request.contract_covered)
        self.assertFalse(request.contract_chargeable)

    def test_facilities_manager_can_open_contract_without_accounting_access(self):
        self.assertFalse(
            self.facility_manager.has_group("account.group_account_invoice")
        )
        contract = self.contract.with_user(self.facility_manager)
        values = contract.read(["name", "invoiced_revenue", "margin"])[0]
        self.assertEqual(values["name"], "HVAC AMC")
        self.assertEqual(values["invoiced_revenue"], 0.0)

    def test_plain_internal_user_cannot_read_contract_register(self):
        user = self.env["res.users"].with_context(no_reset_password=True).create({
            "name": "Facilities Field User",
            "login": "facilities-field-user@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [Command.set(self.env.company.ids)],
            "groups_id": [Command.set([self.env.ref("base.group_user").id])],
        })
        with self.assertRaises(AccessError):
            self.contract.with_user(user).read(["name"])

    def test_work_on_an_uncovered_asset_finds_nothing(self):
        request = self._request(equipment=self.lift)
        self.assertFalse(request.facility_contract_id)
        self.assertFalse(request.contract_covered)
        self.assertFalse(
            request.contract_chargeable,
            "with no contract there is nothing to be outside the scope of",
        )

    def test_an_expired_contract_does_not_cover_todays_work(self):
        """Cover has to lapse with the end date, or a finished contract keeps
        absorbing cost that should have been quoted."""
        self.contract.date_end = self.today - relativedelta(days=1)
        request = self._request()
        self.assertFalse(request.facility_contract_id)

    def test_out_of_scope_work_is_flagged_as_chargeable(self):
        self.contract.covers_corrective = False
        request = self._request(maintenance_type="corrective")
        self.assertEqual(request.facility_contract_id, self.contract)
        self.assertFalse(request.contract_covered)
        self.assertTrue(request.contract_chargeable)

    def test_a_manual_override_survives_when_nothing_matches(self):
        request = self._request(equipment=self.lift)
        request.facility_contract_id = self.contract
        request.request_date = self.today - relativedelta(days=1)
        self.assertEqual(
            request.facility_contract_id, self.contract,
            "an empty match must not wipe a deliberate assignment",
        )

    # ------------------------------------------------------------------
    # SLA precedence
    # ------------------------------------------------------------------
    def test_the_contract_sla_beats_the_standing_matrix(self):
        """What was sold outranks what is standard, even when the matrix has a
        sharper policy that would otherwise have been picked first."""
        matrix = self.env["facility.sla.policy"].create({
            "name": "House standard — 8h/72h",
            "sequence": 1,
            "response_hours": 8.0,
            "resolution_hours": 72.0,
        })
        covered = self._request()
        uncovered = self._request(equipment=self.lift)

        self.assertEqual(covered.sla_policy_id, self.sla_contract)
        self.assertEqual(
            uncovered.sla_policy_id, matrix,
            "an asset outside the contract must not inherit its promise",
        )

    def test_without_a_contract_sla_the_matrix_still_applies(self):
        self.contract.sla_policy_id = False
        matrix = self.env["facility.sla.policy"].create({
            "name": "House standard", "sequence": 1,
            "response_hours": 8.0, "resolution_hours": 72.0,
        })
        request = self._request()
        self.assertEqual(request.sla_policy_id, matrix)

    # ------------------------------------------------------------------
    # Performance
    # ------------------------------------------------------------------
    def test_covered_cost_and_recoverable_cost_are_kept_apart(self):
        """Out-of-scope cost is recoverable, so counting it against the fee
        would make a healthy contract look like it is losing money."""
        covered = self._request(maintenance_type="preventive")
        covered.write({"labor_hours": 4.0, "parts_cost": 100.0})

        self.contract.covers_corrective = False
        chargeable = self._request(maintenance_type="corrective")
        chargeable.write({"contractor_cost": 800.0})

        self.contract.invalidate_recordset()
        self.assertEqual(self.contract.covered_cost, covered.total_cost)
        self.assertEqual(self.contract.chargeable_cost, 800.0)
        self.assertEqual(self.contract.request_count, 2)

    def test_pm_entitlement_counts_only_delivered_visits(self):
        done_stage = self.env["maintenance.stage"].search(
            [("done", "=", True)], limit=1)
        self.assertTrue(done_stage, "core maintenance ships a done stage")

        delivered = self._request(maintenance_type="preventive")
        delivered.stage_id = done_stage
        self._request(maintenance_type="preventive")  # still scheduled
        self._request(maintenance_type="corrective")  # not a PM visit

        self.contract.invalidate_recordset()
        self.assertEqual(self.contract.pm_visits_used, 1)
        self.assertEqual(self.contract.pm_visits_remaining, 11)

    def test_margin_is_revenue_less_absorbed_cost(self):
        self._invoice(3)
        request = self._request(maintenance_type="preventive")
        request.write({"contractor_cost": 500.0})

        self.contract.invalidate_recordset()
        self.assertEqual(self.contract.invoiced_revenue, 3000.0)
        self.assertEqual(self.contract.covered_cost, 500.0)
        self.assertEqual(self.contract.margin, 2500.0)
        self.assertAlmostEqual(
            self.contract.margin_percent, 2500 / 3000 * 100, places=4)

    def test_a_draft_invoice_is_not_revenue(self):
        """Unposted billing is an intention, not income."""
        self._invoice(1, post=False)
        self.contract.invalidate_recordset()
        self.assertEqual(self.contract.invoiced_revenue, 0.0)

    def test_a_loss_making_contract_shows_a_negative_margin(self):
        self._invoice(1)
        request = self._request(maintenance_type="corrective")
        request.write({"contractor_cost": 4000.0})

        self.contract.invalidate_recordset()
        self.assertEqual(self.contract.margin, -3000.0)

    # ------------------------------------------------------------------
    # Renewal
    # ------------------------------------------------------------------
    def test_expiring_contracts_are_flagged_once(self):
        self.contract.write({
            "date_end": self.today + relativedelta(days=30),
            "renewal_notice_days": 60,
        })
        self.assertEqual(self.contract.days_to_expiry, 30)

        model = self.env["contract.contract"]
        model._cron_flag_renewals()
        self.assertTrue(self.contract.renewal_notified)
        messages = len(self.contract.message_ids)

        # A second sweep must not nag again.
        model._cron_flag_renewals()
        self.assertEqual(len(self.contract.message_ids), messages)

    def test_a_contract_far_from_expiry_is_left_alone(self):
        self.contract.write({
            "date_end": self.today + relativedelta(days=300),
            "renewal_notice_days": 60,
        })
        self.env["contract.contract"]._cron_flag_renewals()
        self.assertFalse(self.contract.renewal_notified)

    def test_expiring_contracts_are_searchable(self):
        self.contract.date_end = self.today + relativedelta(days=20)
        soon = self.env["contract.contract"].search([
            ("is_amc", "=", True), ("days_to_expiry", "<=", 30)])
        self.assertIn(self.contract, soon)
        later = self.env["contract.contract"].search([
            ("is_amc", "=", True), ("days_to_expiry", ">", 30)])
        self.assertNotIn(self.contract, later)
