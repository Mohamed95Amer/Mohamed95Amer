"""Allocation and access are the same act, so these are access tests.

Anything here that only checked that a row was written would be testing the
ORM. What matters is whether a real user, under the real record rules, can see
a real record — and stops being able to when they come off the job.
"""

from odoo import Command, fields
from odoo.tests.common import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestAllocationProjection(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Allocation = cls.env["majal.allocation"]
        role = cls.env["majal.access.role"].search(
            [("code", "=", "field_user")], limit=1)

        def make_user(login, scope="construction"):
            return cls.env["res.users"].sudo().with_context(
                no_reset_password=True
            ).create({
                "name": login,
                "login": "%s@majal.test" % login,
                "company_id": cls.env.company.id,
                "company_ids": [Command.set([cls.env.company.id])],
                "majal_role_id": role.id,
                "majal_industry_scope": scope,
                "groups_id": [Command.set(
                    cls.env["res.users"]._majal_group_ids_for(role, scope))],
            })

        cls.worker = make_user("alloc-worker")
        cls.outsider = make_user("alloc-outsider")
        cls.employee = cls.env["hr.employee"].sudo().create({
            "name": "Allocated Worker",
            "user_id": cls.worker.id,
            "company_id": cls.env.company.id,
        })
        # Somebody real on site with nothing to log in to — most of a crew.
        cls.labourer = cls.env["hr.employee"].sudo().create({
            "name": "Site Labourer",
            "company_id": cls.env.company.id,
        })

        cls.project = cls.env["project.project"].sudo().create({
            "name": "Allocation Project",
            "is_construction": True,
            "project_code": "ALLOC-1",
            "company_id": cls.env.company.id,
        })
        cls.defect = cls.env["construction.defect"].sudo().create({
            "name": "Cracked screed",
            "project_id": cls.project.id,
        })
        cls.role_engineer = cls.env.ref("majal_workforce.role_site_engineer")
        cls.role_labourer = cls.env.ref("majal_workforce.role_labourer")

    def _allocate(self, employee, **values):
        return self.Allocation.sudo().create({
            "employee_id": employee.id,
            "project_id": self.project.id,
            "role_id": self.role_engineer.id,
            **values,
        })

    def _can_see_defect(self, user):
        return bool(
            self.env["construction.defect"].with_user(user).search(
                [("id", "=", self.defect.id)]))

    # ------------------------------------------------------------------
    # The point of the whole module
    # ------------------------------------------------------------------
    def test_allocating_somebody_lets_them_see_the_work(self):
        self.assertFalse(self._can_see_defect(self.worker))
        self._allocate(self.employee)
        self.assertTrue(self._can_see_defect(self.worker))

    def test_it_does_not_let_everybody_else_see_it(self):
        self._allocate(self.employee)
        self.assertFalse(self._can_see_defect(self.outsider))

    def test_removing_the_allocation_removes_the_access(self):
        allocation = self._allocate(self.employee)
        self.assertTrue(self._can_see_defect(self.worker))
        allocation.unlink()
        self.assertFalse(self._can_see_defect(self.worker))

    def test_a_lapsed_end_date_revokes_access_when_the_cron_runs(self):
        """Nothing lapses on its own — the rules read membership live. The
        cron is what makes a date mean anything, which is also why revocation
        is unattended and why the grace period exists."""
        allocation = self._allocate(self.employee)
        self.assertTrue(self._can_see_defect(self.worker))
        allocation.write({
            "date_start": "2019-01-01", "date_end": "2019-06-01"})
        self.Allocation._cron_sync_membership()
        self.assertFalse(self._can_see_defect(self.worker))

    def test_a_recent_end_date_is_inside_the_grace_period(self):
        """A leaving date is rarely the day the handover finishes."""
        today = fields.Date.context_today(self.env.user)
        allocation = self._allocate(
            self.employee,
            date_start=fields.Date.subtract(today, days=30),
            date_end=fields.Date.subtract(today, days=2),
        )
        self.Allocation._cron_sync_membership()
        self.assertEqual(allocation.state, "ended")
        self.assertTrue(self._can_see_defect(self.worker))

    # ------------------------------------------------------------------
    # People without a login
    # ------------------------------------------------------------------
    def test_a_labourer_can_be_allocated_and_grants_nobody_anything(self):
        before = self.project.majal_member_ids
        allocation = self._allocate(
            self.labourer, role_id=self.role_labourer.id)
        self.assertTrue(allocation.exists())
        self.assertFalse(allocation.user_id)
        self.assertEqual(self.project.majal_member_ids, before)

    # ------------------------------------------------------------------
    # Things that must not happen
    # ------------------------------------------------------------------
    def test_the_manager_field_is_never_written_by_the_projection(self):
        """Every generated rule compares majal_manager_id with '=', so it
        holds one person. Two lead allocations would take turns overwriting
        each other, and the rule would silently follow whichever wrote last."""
        self.project.sudo().write({"majal_manager_id": self.outsider.id})
        self._allocate(self.employee)
        self.Allocation._cron_sync_membership()
        self.project.invalidate_recordset()
        self.assertEqual(self.project.majal_manager_id, self.outsider)

    def test_running_the_projection_twice_changes_nothing(self):
        self._allocate(self.employee)
        self.Allocation._cron_sync_membership()
        first = self.project.majal_member_ids
        self.Allocation._cron_sync_membership()
        self.project.invalidate_recordset()
        self.assertEqual(self.project.majal_member_ids, first)

    def test_adding_somebody_to_the_team_directly_creates_an_allocation(self):
        """Membership predates this module. Reverting a direct write on the
        next cron sweep would be worse than either honouring or ignoring it,
        so it is adopted instead."""
        self.project.sudo().write(
            {"majal_member_ids": [Command.link(self.outsider.id)]})
        adopted = self.Allocation.sudo().search([
            ("project_id", "=", self.project.id),
            ("user_id", "=", self.outsider.id),
        ])
        self.assertTrue(adopted)
        self.assertEqual(adopted.origin, "adopted")
        self.Allocation._cron_sync_membership()
        self.project.invalidate_recordset()
        self.assertIn(self.outsider, self.project.majal_member_ids)

    def test_a_field_user_cannot_read_the_whole_staffing_plan(self):
        """Who is on which job, and how thinly everyone is spread, is
        commercially sensitive — a worse leak than most of the records the
        allocations govern."""
        self._allocate(self.employee)
        elsewhere = self.env["project.project"].sudo().create({
            "name": "Someone Else's Project",
            "is_construction": True,
            "company_id": self.env.company.id,
        })
        hidden = self.Allocation.sudo().create({
            "employee_id": self.env["hr.employee"].sudo().create({
                "name": "Rival Crew"}).id,
            "project_id": elsewhere.id,
            "role_id": self.role_engineer.id,
        })
        visible = self.Allocation.with_user(self.worker).search([])
        self.assertNotIn(hidden, visible)


@tagged("post_install", "-at_install")
class TestLocationCascade(TransactionCase):
    """Facilities is where the hierarchy either works or the feature doesn't.

    Every facilities rule reaches an asset's location by its exact id, and
    Odoo cannot express "a location any of whose ancestors names me" in one
    domain leaf — so the inheritance has to be materialised by the projection.
    Without it, allocating a technician to a building leaves them blind to
    every room inside it.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.Allocation = cls.env["majal.allocation"]
        role = cls.env["majal.access.role"].search(
            [("code", "=", "field_user")], limit=1)
        cls.tech = cls.env["res.users"].sudo().with_context(
            no_reset_password=True).create({
                "name": "Cascade Tech",
                "login": "cascade-tech@majal.test",
                "company_id": cls.env.company.id,
                "company_ids": [Command.set([cls.env.company.id])],
                "majal_role_id": role.id,
                "majal_industry_scope": "facilities",
                "groups_id": [Command.set(
                    cls.env["res.users"]._majal_group_ids_for(
                        role, "facilities"))],
            })
        cls.employee = cls.env["hr.employee"].sudo().create({
            "name": "Cascade Tech",
            "user_id": cls.tech.id,
            "company_id": cls.env.company.id,
        })
        Location = cls.env["facility.location"].sudo()
        cls.site = Location.create({
            "name": "Cascade Site", "location_type": "site",
            "company_id": cls.env.company.id})
        cls.building = Location.create({
            "name": "Tower A", "location_type": "building",
            "parent_id": cls.site.id, "company_id": cls.env.company.id})
        cls.floor = Location.create({
            "name": "Level 4", "location_type": "floor",
            "parent_id": cls.building.id, "company_id": cls.env.company.id})
        cls.room = Location.create({
            "name": "Plant Room", "location_type": "room",
            "parent_id": cls.floor.id, "company_id": cls.env.company.id})
        cls.role_technician = cls.env.ref("majal_workforce.role_technician")

    def test_allocating_to_the_site_reaches_a_room_three_levels_down(self):
        self.Allocation.sudo().create({
            "employee_id": self.employee.id,
            "location_id": self.site.id,
            "role_id": self.role_technician.id,
        })
        self.room.invalidate_recordset()
        self.assertIn(self.tech, self.room.member_user_ids)
        self.assertIn(self.tech, self.floor.member_user_ids)

    def test_pinning_somebody_to_one_floor_keeps_them_there(self):
        self.Allocation.sudo().create({
            "employee_id": self.employee.id,
            "location_id": self.floor.id,
            "role_id": self.role_technician.id,
            "cascade_children": False,
        })
        self.floor.invalidate_recordset()
        self.room.invalidate_recordset()
        self.assertIn(self.tech, self.floor.member_user_ids)
        self.assertNotIn(self.tech, self.room.member_user_ids)

    def test_moving_a_branch_moves_the_inherited_team_with_it(self):
        """Reshaping the tree changes who inherits what, and nobody thinks to
        re-run anything after dragging a floor to another building."""
        self.Allocation.sudo().create({
            "employee_id": self.employee.id,
            "location_id": self.building.id,
            "role_id": self.role_technician.id,
        })
        self.room.invalidate_recordset()
        self.assertIn(self.tech, self.room.member_user_ids)

        orphan = self.env["facility.location"].sudo().create({
            "name": "Tower B", "location_type": "building",
            "parent_id": self.site.id, "company_id": self.env.company.id})
        self.floor.sudo().write({"parent_id": orphan.id})
        self.room.invalidate_recordset()
        self.assertNotIn(self.tech, self.room.member_user_ids)
