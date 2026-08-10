"""Property joining the access ladder.

The levels themselves ship with an empty property column so that a
construction-only tenant never installs the Property app just to have
access levels; this module fills the column in, so this is where it is
tested.
"""

from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPropertyScope(TransactionCase):
    """Property joining the access ladder alongside construction and FM."""

    def _user(self, login, scope):
        user = self.env["res.users"].create({
            "name": login, "login": login, "email": f"{login}@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
        })
        # Groups follow from applying the level, not from writing the two
        # fields: _majal_apply_role is the single door they go through.
        user._majal_apply_role(
            self.env.ref("majal_administration.role_manager"), scope)
        return user

    def test_a_property_scoped_user_gets_the_property_groups(self):
        user = self._user("scope.property", "real_estate")
        self.assertTrue(user.has_group(
            "majal_real_estate.group_majal_real_estate_manager"))

    def test_a_property_scoped_user_does_not_get_construction_groups(self):
        user = self._user("scope.property.only", "real_estate")
        self.assertFalse(user.has_group("construction_base.group_construction_pm"))

    def test_a_construction_scoped_user_gets_no_property_groups(self):
        user = self._user("scope.construction", "construction")
        self.assertFalse(user.has_group(
            "majal_real_estate.group_majal_real_estate_user"))

    def test_the_combined_property_scope_grants_both_suites(self):
        user = self._user("scope.both.property", "property_facilities")
        self.assertTrue(user.has_group(
            "majal_real_estate.group_majal_real_estate_manager"))
        self.assertTrue(user.has_group(
            "majal_administration.group_facilities_manager"))

    def test_an_existing_both_scoped_user_is_unchanged(self):
        """The upgrade must not quietly restate what anybody already had."""
        user = self._user("scope.legacy.both", "both")
        self.assertTrue(user.has_group("construction_base.group_construction_pm"))
        self.assertTrue(user.has_group(
            "majal_administration.group_facilities_manager"))
        self.assertFalse(user.has_group(
            "majal_real_estate.group_majal_real_estate_user"))
