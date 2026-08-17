from datetime import timedelta

from odoo import Command, fields
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPropertyCompanyIsolation(TransactionCase):
    """The Property suite must never become a cross-company data window."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company_a = cls.env.company
        cls.company_b = cls.env["res.company"].create({"name": "Property Isolation B"})
        groups = [
            cls.env.ref("majal_real_estate.group_majal_real_estate_manager").id,
            cls.env.ref("majal_property_operations.group_majal_property_manager").id,
            cls.env.ref("majal_property_ownership.group_majal_owners_association").id,
            cls.env.ref("majal_property_listing.group_majal_property_listing_manager").id,
            cls.env.ref("majal_property_account.group_majal_property_account_manager").id,
        ]
        cls.user = cls.env["res.users"].with_context(no_reset_password=True).create({
            "name": "Property Company A Manager",
            "login": "property-company-a-isolation@majal.test",
            "company_id": cls.company_a.id,
            "company_ids": [Command.set([cls.company_a.id])],
            "groups_id": [Command.set(groups)],
        })
        cls.partner = cls.env["res.partner"].create({"name": "Isolation Tenant"})

        cls.development_a, cls.unit_a = cls._inventory(cls.company_a, "ISO-A")
        cls.development_b, cls.unit_b = cls._inventory(cls.company_b, "ISO-B")

    @classmethod
    def _inventory(cls, company, code):
        development = cls.env["majal.development"].sudo().with_company(company).create({
            "name": f"Development {code}", "code": code, "company_id": company.id,
        })
        building = cls.env["majal.building"].sudo().with_company(company).create({
            "name": f"Tower {code}", "code": code,
            "development_id": development.id,
        })
        floor = cls.env["majal.floor"].sudo().with_company(company).create({
            "name": f"Floor {code}", "number": 1, "building_id": building.id,
        })
        unit = cls.env["majal.unit"].sudo().with_company(company).create({
            "name": f"UNIT-{code}", "floor_id": floor.id,
            "status": "available", "list_price": 500000,
        })
        return development, unit

    def _visible_ids(self, model, records):
        return set(
            self.env[model]
            .with_user(self.user)
            .with_context(allowed_company_ids=[self.company_a.id])
            .search([("id", "in", records.ids)])
            .ids
        )

    def test_company_rules_cover_every_property_business_table(self):
        xmlids = {
            "majal_real_estate": [
                "rule_majal_development_company", "rule_majal_community_company",
                "rule_majal_building_company", "rule_majal_floor_company",
                "rule_majal_unit_type_company", "rule_majal_unit_company",
                "rule_majal_reservation_company", "rule_majal_payment_plan_company",
                "rule_majal_payment_plan_line_company",
                "rule_majal_payment_installment_company",
                "rule_majal_commission_company", "rule_majal_lead_company",
                "rule_majal_handover_company", "rule_majal_handover_snag_company",
                "rule_majal_cheque_company", "rule_majal_property_document_company",
            ],
            "majal_property_operations": [
                "rule_majal_lease_company", "rule_majal_lease_rent_line_company",
                "rule_majal_lease_inspection_company",
                "rule_majal_lease_inspection_line_company",
                "rule_majal_maintenance_request_company",
            ],
            "majal_property_ownership": [
                "rule_majal_service_charge_budget_company",
                "rule_majal_service_charge_budget_line_company",
                "rule_majal_service_charge_company",
                "rule_majal_owner_statement_company",
                "rule_majal_owner_statement_line_company",
            ],
            "majal_property_listing": ["rule_majal_property_listing_company"],
            "majal_property_account": ["rule_majal_property_accounting_settings_company"],
        }
        for module, names in xmlids.items():
            for name in names:
                rule = self.env.ref(f"{module}.{name}")
                self.assertTrue(
                    rule["global"], f"{module}.{name} must be a global rule")
                self.assertIn("company_ids", rule.domain_force)

    def test_core_inventory_is_hidden_across_companies(self):
        records = self.development_a | self.development_b
        self.assertEqual(self._visible_ids("majal.development", records), {self.development_a.id})
        units = self.unit_a | self.unit_b
        self.assertEqual(self._visible_ids("majal.unit", units), {self.unit_a.id})

    def test_transactions_are_hidden_across_companies(self):
        today = fields.Date.context_today(self.env["majal.lease"])
        leases = self.env["majal.lease"].sudo().create([
            {
                "unit_id": self.unit_a.id, "tenant_id": self.partner.id,
                "start_date": today, "end_date": today + timedelta(days=364),
                "annual_rent": 50000,
            },
            {
                "unit_id": self.unit_b.id, "tenant_id": self.partner.id,
                "start_date": today, "end_date": today + timedelta(days=364),
                "annual_rent": 60000,
            },
        ])
        self.assertEqual(self._visible_ids("majal.lease", leases), {leases[0].id})

        budgets = self.env["majal.service.charge.budget"].sudo().create([
            {"development_id": self.development_a.id, "year": 2097},
            {"development_id": self.development_b.id, "year": 2097},
        ])
        self.assertEqual(
            self._visible_ids("majal.service.charge.budget", budgets), {budgets[0].id})

        listings = self.env["majal.property.listing"].sudo().create([
            {
                "name": "Listing A", "unit_id": self.unit_a.id,
                "public_title": "Listing A", "listing_price": 500000,
            },
            {
                "name": "Listing B", "unit_id": self.unit_b.id,
                "public_title": "Listing B", "listing_price": 500000,
            },
        ])
        self.assertEqual(
            self._visible_ids("majal.property.listing", listings), {listings[0].id})
