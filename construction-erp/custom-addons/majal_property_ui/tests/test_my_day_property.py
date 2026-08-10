"""Property work reaching the same My Day screen as construction work.

The screen serves three audiences from one page, so the tests that matter
are the ones about who does *not* see a section: a facilities technician
should never be queried against a reservation register, and a user with
no property access must not make the whole page fail.
"""

from datetime import timedelta

from odoo import fields
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestPropertyMyDay(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Present only where Construction is installed; Property is sold on
        # its own, so this suite has to run without it.
        rules = cls.env.get("construction.approval.rule")
        if rules is not None:
            rules.search([]).write({"active": False})
        cls.today = fields.Date.context_today(cls.env["majal.reservation"])

        cls.agent = cls._property_user("myday.agent", "Property Agent")
        cls.other_agent = cls._property_user("myday.other.agent", "Other Agent")
        # A user from another suite, where one is installed. On a
        # Property-only database the nearest equivalent is a plain employee,
        # which tests the same thing: no property group, no property sections.
        site_group = cls.env.ref(
            "construction_base.group_construction_site_engineer",
            raise_if_not_found=False)
        cls.site_engineer = cls.env["res.users"].create({
            "name": "Other Suite User", "login": "myday.site.only",
            "email": "myday.site.only@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                gid for gid in [
                    site_group.id if site_group else None,
                    cls.env.ref("base.group_user").id,
                ] if gid
            ])],
        })
        # Deliberately plain: no property group, no construction group.
        cls.outsider = cls.env["res.users"].create({
            "name": "Plain Employee", "login": "myday.outsider",
            "email": "myday.outsider@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [cls.env.ref("base.group_user").id])],
        })

        cls.development = cls.env["majal.development"].create(
            {"name": "My Day Heights", "code": "MYDRE"})
        cls.building = cls.env["majal.building"].create(
            {"name": "Tower A", "code": "A", "development_id": cls.development.id})
        cls.floor = cls.env["majal.floor"].create(
            {"name": "Floor 3", "number": 3, "building_id": cls.building.id})
        cls.buyer = cls.env["res.partner"].create({"name": "My Day Buyer"})

    @classmethod
    def _property_user(cls, login, name):
        return cls.env["res.users"].create({
            "name": name, "login": login, "email": f"{login}@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("majal_real_estate.group_majal_real_estate_user").id,
                cls.env.ref("base.group_user").id,
            ])],
        })

    def _unit(self, name):
        return self.env["majal.unit"].create({
            "name": name, "floor_id": self.floor.id,
            "list_price": 1000000, "status": "available",
        })

    def _reservation(self, user, unit, **vals):
        return self.env["majal.reservation"].create({
            "unit_id": unit.id, "partner_id": self.buyer.id,
            "user_id": user.id, "sale_price": 1000000, **vals,
        })

    def _my_day(self, user):
        return self.env["construction.my.day"].with_user(user).my_day()

    def _section(self, payload, key):
        return next((s for s in payload["sections"] if s["key"] == key), None)

    def test_an_agent_sees_their_own_reservations(self):
        self._reservation(self.agent, self._unit("A-0301"))
        section = self._section(self._my_day(self.agent), "property_reservations")
        self.assertIsNotNone(section)
        self.assertEqual(section["count"], 1)

    def test_an_agent_does_not_see_another_agents_reservations(self):
        self._reservation(self.other_agent, self._unit("A-0301"))
        self.assertIsNone(
            self._section(self._my_day(self.agent), "property_reservations"))

    def test_a_lapsed_hold_is_counted_as_urgent(self):
        """Dates are deliberately days either side of today, not today itself:
        this class builds records as admin and reads the screen as the agent,
        and "today" is resolved in each user's own timezone, so an exact
        boundary makes the test fail for an hour every evening."""
        self._reservation(
            self.agent, self._unit("A-0301"),
            reservation_date=self.today - timedelta(days=30),
            expiry_date=self.today - timedelta(days=2))
        section = self._section(self._my_day(self.agent), "property_reservations")
        self.assertEqual(section["urgent"], 1)

        self._reservation(
            self.agent, self._unit("A-0302"),
            expiry_date=self.today + timedelta(days=30))
        section = self._section(self._my_day(self.agent), "property_reservations")
        self.assertEqual(section["count"], 2)
        self.assertEqual(section["urgent"], 1)

    def test_a_construction_only_user_is_shown_no_property_sections(self):
        """The group gate exists so a site engineer is never queried against
        registers that are not their job."""
        self._reservation(self.agent, self._unit("A-0301"))
        payload = self._my_day(self.site_engineer)
        for key in ("property_reservations", "property_leads", "property_handovers",
                    "property_tenant_requests", "property_rent_arrears"):
            self.assertIsNone(self._section(payload, key))

    def test_a_user_with_no_property_access_does_not_break_the_page(self):
        """This is the regression the hardening rules exist for: without the
        group and has_access guards the whole screen raises, not one row."""
        self._reservation(self.agent, self._unit("A-0301"))
        payload = self._my_day(self.outsider)
        self.assertIn("sections", payload)

    def test_every_property_action_carries_explicit_views(self):
        """Actions fetched over the ORM are not normalised server-side; the
        client throws while preprocessing one without `views`."""
        self._reservation(self.agent, self._unit("A-0301"))
        section = self._section(self._my_day(self.agent), "property_reservations")
        self.assertEqual(
            section["action"]["views"], [[False, "list"], [False, "form"]])

    def test_tenant_requests_reach_the_person_they_are_assigned_to(self):
        unit = self._unit("A-0301")
        self.env["majal.maintenance.request"].create({
            "name": "AC dripping", "unit_id": unit.id,
            "user_id": self.agent.id, "priority": "2",
        })
        section = self._section(
            self._my_day(self.agent), "property_tenant_requests")
        self.assertEqual(section["count"], 1)
        self.assertEqual(section["urgent"], 1)

    def test_rent_arrears_resolve_through_the_lease_without_a_rule_clash(self):
        """The rent line is filtered by a leaf through the lease, which is why
        it goes via _candidate_ids rather than a direct related leaf."""
        unit = self._unit("A-0301")
        lease = self.env["majal.lease"].create({
            "unit_id": unit.id,
            "tenant_id": self.buyer.id,
            "user_id": self.agent.id,
            "start_date": self.today - timedelta(days=400),
            "end_date": self.today - timedelta(days=40),
            "frequency": "annual",
            "annual_rent": 120000,
        })
        lease.action_generate_rent_schedule()
        lease.action_activate()
        section = self._section(self._my_day(self.agent), "property_rent_arrears")
        self.assertIsNotNone(section)
        self.assertGreaterEqual(section["urgent"], 1)
