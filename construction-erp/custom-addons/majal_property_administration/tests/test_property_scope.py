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

    def test_the_all_suites_scope_covers_every_suite_including_property(self):
        """This assertion used to read the other way round, and that was the
        bug: "both" was written when the platform had two suites and meant
        the whole platform. Reading it as construction-and-facilities-only
        took the Property app away from everyone who had it."""
        user = self._user("scope.legacy.both", "both")
        self.assertTrue(user.has_group("construction_base.group_construction_pm"))
        self.assertTrue(user.has_group(
            "majal_administration.group_facilities_manager"))
        self.assertTrue(user.has_group(
            "majal_real_estate.group_majal_real_estate_manager"))


@tagged("post_install", "-at_install")
class TestExistingUsersKeepProperty(TransactionCase):
    """The regression that hid the whole app.

    Levels are applied by rewriting a user's groups wholesale. When
    Property arrived, "both" still meant construction-and-facilities, so
    applying any level removed the Property groups from everyone who had
    them -- including the administrator, leaving the app invisible and its
    manager group with no members at all.
    """

    def test_an_all_suites_user_has_the_property_groups(self):
        user = self.env["res.users"].create({
            "name": "All Suites", "login": "scope.allsuites",
            "email": "scope.allsuites@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
        })
        user._majal_apply_role(
            self.env.ref("majal_administration.role_manager"), "both")
        self.assertTrue(user.has_group(
            "majal_real_estate.group_majal_real_estate_manager"))
        self.assertTrue(user.has_group("construction_base.group_construction_pm"))

    def test_the_administrator_can_still_see_the_property_app(self):
        admin = self.env.ref("base.user_admin")
        self.assertTrue(
            admin.has_group("majal_real_estate.group_majal_real_estate_user"),
            "the administrator lost access to the Property app")

    def test_the_property_manager_group_is_not_empty(self):
        group = self.env.ref("majal_real_estate.group_majal_real_estate_manager")
        self.assertTrue(
            group.users,
            "nobody holds the Property manager group, so nobody can use the app")
