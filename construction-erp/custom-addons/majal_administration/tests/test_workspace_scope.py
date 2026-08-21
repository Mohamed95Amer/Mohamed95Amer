"""Workspace access means what it says, for every value it can take.

Every tenant rule used to test one literal string: construction models
excluded `'facilities'` and nothing else, facility models excluded
`'construction'` and nothing else. That held while the selection had three
values. The Property merge added `real_estate` and `property_facilities`,
and both new values fell straight through every exclusion -- so a user whose
workspace access read "Property" could read the construction register and
the facilities register, subject only to company.

Nobody wrote a bug. One branch added values to a selection; another owns the
rules that switch on it. That is exactly the class of fault a merge exists to
surface, and it is invisible to each side alone.

The rules are allow-lists now, which is why the last test here matters most:
a scope value the code has never heard of must read nothing at all. A
deny-list keyed on one string cannot survive its enum growing; an allow-list
fails closed, which is the direction a tenancy boundary has to fail.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestWorkspaceScope(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env["res.company"].create({"name": "Scope Co"})
        cls.env["res.users"]._majal_install_tenant_rules()

        cls.project = cls.env["project.project"].create({
            "name": "Scope Tower", "is_construction": True,
            "company_id": cls.company.id,
        })
        cls.location = cls.env["facility.location"].create({
            "name": "Scope Block", "company_id": cls.company.id,
        })

    def _user(self, login, scope):
        user = new_test_user(
            self.env, login=login, password=f"{login}-pw-2026-long",
            groups="construction_base.group_construction_manager,"
                   "majal_administration.group_facilities_manager",
            company_id=self.company.id,
            company_ids=[(6, 0, [self.company.id])])
        user.majal_industry_scope = scope
        # A senior access level, so the workspace scope is the only thing
        # varying between these personas. Without one the role gate now
        # refuses them company-wide reads -- correctly, but that would make
        # every case here pass for the wrong reason and stop testing scope
        # at all.
        senior = self.env["majal.access.role"].search(
            [("rank", ">=", 40)], order="rank", limit=1)
        if senior:
            user.majal_role_id = senior.id
        return user

    def _can_read(self, user, model, record):
        """Whether the record survives the rules for this user.

        search() rather than exists(): exists() issues a plain row lookup and
        never applies a record rule. And invalidate_all() first, because the
        cache lives on the transaction -- a value already fetched as the
        superuser is handed over without any rule being consulted, which has
        made two tests on this branch pass against unfixed code.
        """
        self.env.invalidate_all()
        return bool(self.env[model].with_user(user)
                    .search([("id", "=", record.id)]))

    # ---------------------------------------------------------- construction

    def test_a_property_user_cannot_read_the_construction_register(self):
        """The leak the merge introduced."""
        user = self._user("scope.property", "real_estate")
        self.assertFalse(
            self._can_read(user, "project.project", self.project),
            "A user whose workspace access is Property read a construction "
            "project. The rule excluded only the literal 'facilities', so "
            "every scope value added later was granted by default.")

    def test_a_property_facilities_user_cannot_read_construction_either(self):
        user = self._user("scope.propfac", "property_facilities")
        self.assertFalse(
            self._can_read(user, "project.project", self.project))

    def test_a_construction_user_still_reads_construction(self):
        """The guard: closing the leak must not close the feature."""
        user = self._user("scope.construction", "construction")
        self.assertTrue(
            self._can_read(user, "project.project", self.project))

    def test_all_suites_still_reads_construction(self):
        user = self._user("scope.both", "both")
        self.assertTrue(
            self._can_read(user, "project.project", self.project))

    # ------------------------------------------------------------ facilities

    def test_a_property_only_user_cannot_read_the_facilities_register(self):
        user = self._user("scope.proponly", "real_estate")
        self.assertFalse(
            self._can_read(user, "facility.location", self.location))

    def test_a_property_facilities_user_does_read_facilities(self):
        """The half of that scope that is supposed to work.

        `property_facilities` grants both suites by name, so excluding it
        from facilities would be the opposite mistake -- a fix that closes
        the leak and the feature together.
        """
        user = self._user("scope.propfac2", "property_facilities")
        self.assertTrue(
            self._can_read(user, "facility.location", self.location))

    def test_a_facilities_user_still_reads_facilities(self):
        user = self._user("scope.facilities", "facilities")
        self.assertTrue(
            self._can_read(user, "facility.location", self.location))

    # ------------------------------------------------------ the shape itself

    def test_a_scope_the_rules_have_never_heard_of_reads_nothing(self):
        """Why these are allow-lists rather than deny-lists.

        Writing a value the selection does not offer is not a supported
        operation; the point is what the *domain* does with it. The next
        person to add a workspace kind should find it granted nothing until
        they say otherwise, rather than granted everything silently.
        """
        user = self._user("scope.future", "both")
        self.env.cr.execute(
            "UPDATE res_users SET majal_industry_scope = %s WHERE id = %s",
            ("a_scope_added_next_year", user.id))
        user.invalidate_recordset(["majal_industry_scope"])

        self.assertFalse(
            self._can_read(user, "project.project", self.project),
            "An unrecognised workspace scope read the construction register. "
            "The gate must be an allow-list.")
        self.assertFalse(
            self._can_read(user, "facility.location", self.location),
            "An unrecognised workspace scope read the facilities register.")
