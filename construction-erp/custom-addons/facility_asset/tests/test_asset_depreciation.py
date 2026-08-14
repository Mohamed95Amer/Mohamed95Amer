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
