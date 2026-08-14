from datetime import date

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestAssetDepreciation(TransactionCase):
    """purchase_value and expected_life_years were recorded and never used.

    An FM manager could say a chiller cost 400,000 and should last fifteen
    years, and the system could not tell them what it was worth this year.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.equipment = cls.env["maintenance.equipment"].create({
            "name": "Chiller CH-01",
            "purchase_value": 400000.0,
            "expected_life_years": 15,
        })

    def _category(self):
        """A category with the accounts it insists on.

        Written out rather than taken from demo data because this is the
        whole constraint the feature is shaped around: an asset cannot exist
        without one of these, and one of these cannot exist without a
        journal and three accounts.
        """
        account = self.env["account.account"].search([], limit=1)
        journal = self.env["account.journal"].search(
            [("type", "=", "purchase")], limit=1)
        if not account or not journal:
            self.skipTest("no chart of accounts in this database")
        return self.env["account.asset.category"].create({
            "name": "Plant", "journal_id": journal.id,
            "account_asset_id": account.id,
            "account_depreciation_id": account.id,
            "account_depreciation_expense_id": account.id,
        })

    def test_nothing_happens_on_its_own(self):
        """The register is populated when somebody has configured
        accounting, and not before. Creating an asset automatically would
        fail on every database that has no chart of accounts — which is
        every database until somebody sets one up."""
        self.assertFalse(self.equipment.asset_id)

    def test_it_refuses_without_a_category_and_says_why(self):
        """'null value violates not-null constraint' tells an FM manager
        nothing about which box to fill in."""
        with self.assertRaises(UserError) as caught:
            self.equipment.action_create_asset()
        self.assertIn("asset type", str(caught.exception).lower())

    def test_it_refuses_with_nothing_to_depreciate(self):
        equipment = self.env["maintenance.equipment"].create(
            {"name": "Donated fan", "expected_life_years": 5})
        equipment.asset_category_id = self._category()
        with self.assertRaises(UserError):
            equipment.action_create_asset()

    def test_it_refuses_with_no_life_to_spread_it_over(self):
        equipment = self.env["maintenance.equipment"].create(
            {"name": "Pump", "purchase_value": 1000.0})
        equipment.asset_category_id = self._category()
        with self.assertRaises(UserError):
            equipment.action_create_asset()

    def test_it_is_running_not_merely_created(self):
        """The difference the whole feature turns on.

        account.asset.asset.create() computes the board, but the asset stays
        in draft, and _cron_generate_entries only looks at assets in state
        'open'. Left in draft the schedule looks right on screen and nothing
        ever reaches the ledger — which is worse than no depreciation,
        because it reads as done.
        """
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()
        self.assertEqual(self.equipment.asset_id.state, "open")
        self.assertEqual(self.equipment.asset_state, "open")

    def test_the_schedule_is_computed_and_spans_the_stated_life(self):
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()

        lines = self.equipment.asset_id.depreciation_line_ids
        self.assertEqual(len(lines), 15)
        self.assertAlmostEqual(
            sum(lines.mapped("amount")), 400000.0, places=2)

    def test_depreciation_runs_from_commissioning_not_from_data_entry(self):
        """A chiller bought in March and commissioned in September has not
        lost six months of value sitting in a crate."""
        self.equipment.asset_category_id = self._category()
        self.equipment.asset_in_service_date = date(2024, 9, 1)
        self.equipment.action_create_asset()
        self.assertEqual(self.equipment.asset_id.date, date(2024, 9, 1))

    def test_residual_value_is_not_depreciated_away(self):
        """Leaving salvage at zero writes plant down to nothing and
        overstates the annual charge."""
        self.equipment.asset_category_id = self._category()
        self.equipment.asset_salvage_value = 40000.0
        self.equipment.action_create_asset()

        asset = self.equipment.asset_id
        self.assertEqual(asset.salvage_value, 40000.0)
        self.assertAlmostEqual(
            sum(asset.depreciation_line_ids.mapped("amount")), 360000.0,
            places=2)

    def test_retired_equipment_still_depreciating_is_flagged(self):
        """Nothing posts a disposal by itself — an accounting entry that
        appears because somebody changed a status field is how a finance
        team stops trusting the system. But it must be visible."""
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()
        self.assertFalse(self.equipment.asset_needs_disposal)

        self.equipment.tag_status = "retired"
        self.equipment.invalidate_recordset()
        self.assertTrue(self.equipment.asset_needs_disposal)

    def test_disposing_without_a_running_asset_is_refused(self):
        with self.assertRaises(UserError):
            self.equipment.action_dispose_asset()

    def test_the_asset_carries_the_two_numbers_over(self):
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()

        asset = self.equipment.asset_id
        self.assertTrue(asset)
        self.assertEqual(asset.value, 400000.0)
        self.assertEqual(asset.method_number, 15)
        # A year at a time. Anything cleverer belongs to the category; this
        # has two numbers to work from and should not invent a third.
        self.assertEqual(asset.method_period, 12)

    def test_book_value_starts_at_the_full_cost(self):
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()

        self.assertEqual(self.equipment.asset_gross_value, 400000.0)
        self.assertEqual(self.equipment.asset_book_value, 400000.0)
        self.assertEqual(self.equipment.asset_depreciated_value, 0.0)

    def test_it_is_not_put_on_the_register_twice(self):
        self.equipment.asset_category_id = self._category()
        self.equipment.action_create_asset()
        with self.assertRaises(UserError):
            self.equipment.action_create_asset()
