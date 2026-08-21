"""An access level nobody assigned is not an access level that grants
everything.

The tenant rules gated on `not user.majal_role_id or rank >= 40`. The first
half of that made "no access level" mean the same thing as Operations
Manager, and `majal_industry_scope` defaults to "All Suites", so the two
defaults compounded: an internal user holding nothing but base.group_user
read every construction project and every facility location in the company.

Found by giving a persona sweep a control account -- a user created with no
product role at all, precisely so that "the screen opened" could be told
apart from "the permission is missing". The control read three projects and
three locations. Nothing in the suite could see it, because every fixture
in the suite either builds a user with a role or runs as the superuser,
who is exempt from record rules entirely.

Majal's own invite wizard requires an access level, so this was not reachable
through the product's own onboarding. It was reachable through Odoo's
Settings > Users form, through an integration creating users over RPC, and
through upgrading a portal account to internal -- none of them exotic.

The gate fails closed now. The companion migration (18.0.1.3.0) writes
Operations Manager onto every existing role-less internal user, which is
exactly the access the old expression already gave them, so closing the
hole takes nothing away from anybody on upgrade.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestUnassignedReadsNothing(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env["res.company"].create({"name": "Unassigned Co"})
        cls.env["res.users"]._majal_install_tenant_rules()

        cls.project = cls.env["project.project"].sudo().create({
            "name": "Unassigned Tower",
            "is_construction": True,
            "company_id": cls.company.id,
        })
        cls.location = cls.env["facility.location"].sudo().create({
            "name": "Unassigned Block",
            "company_id": cls.company.id,
        })

    def _user(self, login, groups):
        return new_test_user(
            self.env, login=login, password=f"{login}-pw-2026-long",
            groups=groups,
            company_id=self.company.id,
            company_ids=[(6, 0, [self.company.id])])

    def _readable(self, user, model, record):
        """search(), not exists(): exists() never applies a record rule.

        invalidate_all() first -- Odoo's cache lives on the transaction, so a
        value already fetched as the superuser comes back without any rule
        being consulted.
        """
        self.env.invalidate_all()
        return bool(self.env[model].with_user(user)
                    .search([("id", "=", record.id)]))

    # ------------------------------------------------------------ the hole

    def test_a_user_with_no_access_level_reads_no_projects(self):
        user = self._user("unassigned.plain",
                          "construction_base.group_construction_manager")
        self.assertFalse(user.majal_role_id, "fixture should have no role")
        self.assertEqual(
            user.majal_industry_scope, "both",
            "the scope default is half of what made this reachable; if it "
            "changes, this test is no longer covering the same ground")
        self.assertFalse(
            self._readable(user, "project.project", self.project),
            "A user with no access level assigned read a construction "
            "project. The role gate must fail closed.")

    def test_a_user_with_no_access_level_reads_no_locations(self):
        user = self._user("unassigned.plain2",
                          "majal_administration.group_facilities_manager")
        self.assertFalse(
            self._readable(user, "facility.location", self.location),
            "A user with no access level assigned read a facility location.")

    # ----------------------------------------------------------- the guard

    def test_a_senior_role_still_reads_the_whole_company(self):
        """Closing the hole must not close the feature.

        Operations Manager and above deliberately see the whole company
        register rather than only what they manage -- that is the level the
        migration hands to everyone who was relying on the old default.
        """
        senior = self.env["majal.access.role"].search(
            [("rank", ">=", 40)], order="rank", limit=1)
        self.assertTrue(senior, "no senior access level in the shipped roles")

        user = self._user("unassigned.senior",
                          "construction_base.group_construction_manager")
        user.majal_role_id = senior.id
        self.assertTrue(
            self._readable(user, "project.project", self.project),
            "An Operations Manager could not read a company project. The "
            "migration hands this level to every previously role-less user, "
            "so if this fails the upgrade path takes access away.")

    def test_a_junior_role_still_reads_what_it_is_assigned(self):
        """The membership path is untouched by any of this."""
        junior = self.env["majal.access.role"].search(
            [("rank", "<", 40)], order="rank desc", limit=1)
        self.assertTrue(junior, "no junior access level in the shipped roles")

        user = self._user("unassigned.junior",
                          "construction_base.group_construction_manager")
        user.majal_role_id = junior.id
        self.project.sudo().majal_manager_id = user.id
        self.assertTrue(
            self._readable(user, "project.project", self.project),
            "A junior role could not read the project it manages.")

    def test_a_portal_user_is_not_touched_by_the_role_gate(self):
        """`user.share` short-circuits every one of these rules first.

        The migration deliberately skips portal accounts for the same
        reason: an access level on them would mean nothing.
        """
        portal = new_test_user(
            self.env, login="unassigned.portal",
            password="unassigned-portal-pw-2026",
            groups="base.group_portal")
        self.assertTrue(portal.share)
        self.assertFalse(portal.majal_role_id)
