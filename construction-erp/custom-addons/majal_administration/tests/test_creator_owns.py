"""Creating a record must not make it disappear -- or be refused outright.

The tenant rules scope the registers by membership below role rank 40: a
project is visible to a Project Manager only if `majal_manager_id` names
them or `majal_member_ids` contains them. That is the right policy. What
was missing is that a brand new row names nobody, and Odoo applies record
rules to `create` as well as to `read`.

So the product contradicted itself. The ACL grants project creation to the
Project Manager group -- `check_access("create")` returns cleanly -- and the
record rule then refuses the write with "Access Denied by record rules for
operation: create". The role the feature is named after could neither create
a project nor see one.

This was invisible to the whole suite, which creates its fixtures as the
superuser, and invisible to any screenshot, because an empty register looks
exactly like a register you have no records in yet.

The fix is one line of intent: whoever creates a project manages it until
somebody says otherwise. These tests pin both halves -- the create must
succeed, and the creator must still be able to read the row afterwards.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestCreatorOwnsWhatTheyCreate(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env["res.company"].create({"name": "Creator Co"})
        cls.env["res.users"]._majal_install_tenant_rules()

        # Rank 30 is the interesting one: high enough to be handed the
        # feature, low enough that the rule scopes it by membership. Rank 40
        # and above see everything in the company and would pass either way.
        cls.role = cls.env["majal.access.role"].search(
            [("rank", "=", 30)], limit=1)

    def _manager(self, login, scope):
        # project.group_project_manager is what actually carries create on
        # project.project -- the shipped PM persona holds it. Without it the
        # ACL refuses first and the record rule is never consulted, which is
        # a different failure wearing the same words and made the first
        # version of this test look like it was reproducing the bug when it
        # was only tripping over its own fixture.
        user = new_test_user(
            self.env, login=login, password=f"{login}-pw-2026-long",
            groups="construction_base.group_construction_manager,"
                   "majal_administration.group_facilities_manager,"
                   "project.group_project_manager",
            company_id=self.company.id,
            company_ids=[(6, 0, [self.company.id])])
        user.majal_industry_scope = scope
        if self.role:
            user.majal_role_id = self.role.id
        return user

    def _readable(self, user, model, record):
        """search(), not exists(): exists() never applies a record rule.

        invalidate_all() first, because Odoo's cache lives on the
        transaction -- a value already fetched as the superuser is handed
        back without any rule being consulted.
        """
        self.env.invalidate_all()
        return bool(self.env[model].with_user(user)
                    .search([("id", "=", record.id)]))

    # ------------------------------------------------------------ projects

    def test_a_project_manager_can_create_a_project(self):
        """The half that was refused outright."""
        user = self._manager("creator.pm", "construction")
        project = self.env["project.project"].with_user(user).create({
            "name": "Creator Tower",
            "is_construction": True,
            "company_id": self.company.id,
        })
        self.assertTrue(
            project.id,
            "A Project Manager could not create a project. The ACL grants "
            "create and the tenant rule refused it, because the new row "
            "named nobody as its manager.")

    def test_the_creator_can_still_read_it_afterwards(self):
        """The half that would have made it vanish on save."""
        user = self._manager("creator.pm2", "construction")
        project = self.env["project.project"].with_user(user).create({
            "name": "Creator Tower II",
            "is_construction": True,
            "company_id": self.company.id,
        })
        self.assertTrue(
            self._readable(user, "project.project", project),
            "A Project Manager created a project and then could not read it "
            "back. Creating a record must not make it disappear.")

    def test_an_explicit_manager_is_not_overwritten(self):
        """Defaulting is a fallback, never a policy about who owns what.

        Handing the project to somebody else is done by an operations
        manager (rank 40), who reads the whole company register. A rank 30
        creator naming a different manager is refused by the rule, and
        rightly so -- it would be creating a record they cannot see. That
        refusal is the policy working, so it is not what this test is for.
        """
        boss = self._manager("creator.boss", "construction")
        senior = self.env["majal.access.role"].search(
            [("rank", ">=", 40)], order="rank", limit=1)
        if senior:
            boss.majal_role_id = senior.id
        other = self._manager("creator.other", "construction")

        project = self.env["project.project"].with_user(boss).create({
            "name": "Creator Tower III",
            "is_construction": True,
            "company_id": self.company.id,
            "majal_manager_id": other.id,
        })
        self.assertEqual(
            project.majal_manager_id, other,
            "A named manager was replaced by the creating user.")

    def test_data_loaded_records_are_left_alone(self):
        """Under sudo the caller is saying who owns what; believe them.

        Module data and demo files load as the superuser. Silently stamping
        the installing user onto every project they create would make
        ownership an accident of who ran the upgrade.
        """
        project = self.env["project.project"].sudo().create({
            "name": "Data Loaded Tower",
            "is_construction": True,
            "company_id": self.company.id,
        })
        self.assertFalse(
            project.majal_manager_id,
            "A sudo creation acquired a manager it never asked for.")

    # ---------------------------------------------------------- facilities

    def test_a_facility_manager_can_create_a_location(self):
        user = self._manager("creator.fm", "facilities")
        location = self.env["facility.location"].with_user(user).create({
            "name": "Creator Block",
            "company_id": self.company.id,
        })
        self.assertTrue(location.id, "A facility manager could not create a "
                                     "location.")
        self.assertTrue(
            self._readable(user, "facility.location", location),
            "A facility manager created a location and then could not read "
            "it back.")
