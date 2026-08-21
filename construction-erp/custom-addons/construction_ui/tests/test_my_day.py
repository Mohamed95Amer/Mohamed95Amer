from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestMyDay(TransactionCase):
    """One person's own work, gathered from wherever it lives.

    The screen is only worth having if it is complete and it is *theirs*: a
    section that quietly omits somebody's overdue defect is worse than no
    section, because they will stop checking the registers as well.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Demo approval rules would route documents created here into an
        # approval that these tests are not about.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        cls.project = cls.env["project.project"].create({
            "name": "My Day Tower", "is_construction": True,
            "project_code": "MYD", "construction_stage": "execution",
        })
        cls.engineer = cls.env["res.users"].create({
            "name": "Site Engineer", "login": "myday.engineer",
            "email": "myday.engineer@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("construction_base.group_construction_site_engineer").id,
                cls.env.ref("base.group_user").id,
            ])],
        })
        cls.other = cls.env["res.users"].create({
            "name": "Somebody Else", "login": "myday.other",
            "email": "myday.other@majal.test",
            "company_id": cls.env.company.id,
            "company_ids": [(6, 0, [cls.env.company.id])],
            "groups_id": [(6, 0, [
                cls.env.ref("construction_base.group_construction_site_engineer").id,
                cls.env.ref("base.group_user").id,
            ])],
        })
        # Both are on this job. The tenant rules scope the registers by
        # membership, so without this neither engineer can see the project
        # their work sits on. `other` is here to prove My Day shows each
        # person only their own items -- which needs them able to see the
        # project and still get an empty day, not unable to see it at all.
        cls.project.write({
            "majal_member_ids": [(6, 0, (cls.engineer | cls.other).ids)],
        })

    def _my_day(self, user):
        return self.env["construction.my.day"].with_user(user).my_day()

    def _section(self, payload, key):
        return next(
            (s for s in payload["sections"] if s["key"] == key), None)

    def _defect(self, user, **vals):
        return self.env["construction.defect"].create({
            "name": "Crack", "project_id": self.project.id,
            "assigned_user_id": user.id, **vals,
        })

    def test_a_day_with_nothing_on_it_is_empty_rather_than_wrong(self):
        payload = self._my_day(self.engineer)
        self.assertEqual(payload["total"], 0)
        self.assertEqual(payload["sections"], [])
        self.assertEqual(payload["user"], self.engineer.display_name)

    def test_work_assigned_to_me_appears(self):
        self._defect(self.engineer)
        section = self._section(self._my_day(self.engineer), "defects")
        self.assertIsNotNone(section)
        self.assertEqual(section["count"], 1)

    def test_work_assigned_to_somebody_else_does_not(self):
        """The whole point is that it is mine."""
        self._defect(self.other)
        self.assertIsNone(self._section(self._my_day(self.engineer), "defects"))

    def test_a_late_item_is_counted_as_urgent(self):
        self._defect(self.engineer, date_required="2020-01-01")
        self._defect(self.engineer)
        section = self._section(self._my_day(self.engineer), "defects")
        self.assertEqual(section["count"], 2)
        self.assertEqual(section["urgent"], 1)
        self.assertEqual(self._my_day(self.engineer)["urgent"], 1)

    def test_closed_work_drops_off(self):
        defect = self._defect(self.engineer)
        defect.action_start()
        defect.action_ready()
        defect.action_close()
        self.assertIsNone(self._section(self._my_day(self.engineer), "defects"))

    def test_the_total_is_the_sum_of_the_sections(self):
        self._defect(self.engineer)
        self._defect(self.engineer)
        payload = self._my_day(self.engineer)
        self.assertEqual(
            payload["total"], sum(s["count"] for s in payload["sections"]))

    def test_every_row_carries_an_action_the_client_can_actually_run(self):
        """`views` is the field that matters.

        This payload is fetched with an ORM call and handed straight to
        doAction; only actions returned from a *button* get normalised
        server-side, so an action without `views` throws in the client and the
        row silently does nothing. It has happened three times in this project,
        so it is asserted rather than remembered.
        """
        self._defect(self.engineer)
        for section in self._my_day(self.engineer)["sections"]:
            action = section["action"]
            self.assertEqual(action["type"], "ir.actions.act_window")
            self.assertTrue(action.get("views"), section["key"])
            self.assertTrue(action.get("res_model"))
            self.assertTrue(action.get("domain") is not None)

    def test_an_approval_waiting_on_me_comes_first(self):
        """Somebody else is stopped until it is done, so it outranks my own
        work no matter how late that is."""
        manager = self.env["res.users"].create({
            "name": "Approver", "login": "myday.approver",
            "email": "myday.approver@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [
                self.env.ref("construction_base.group_construction_manager").id,
                self.env.ref("base.group_user").id,
            ])],
        })
        self._defect(manager, date_required="2020-01-01")

        boq = self.env["construction.boq"].create(
            {"name": "Bill", "project_id": self.project.id})
        self.env["construction.approval.rule"].create({
            "name": "Variations",
            "model_id": self.env["ir.model"]._get_id(
                "construction.change.order"),
            "step_ids": [(0, 0, {
                "name": "Board",
                "group_id": self.env.ref(
                    "construction_base.group_construction_manager").id,
            })],
        })
        variation = self.env["construction.change.order"].create({
            "name": "Facade", "project_id": self.project.id,
            "boq_id": boq.id, "change_type": "addition",
            "line_ids": [(0, 0, {"name": "Cladding", "quantity": 1,
                                 "unit_rate": 150000.0})],
        })
        variation.action_submit()
        variation.action_request_approval()

        payload = self._my_day(manager)
        self.assertEqual(payload["sections"][0]["key"], "approvals")
        self.assertGreaterEqual(payload["sections"][0]["count"], 1)

    def test_a_facilities_technician_sees_their_own_work_not_a_builders(self):
        """The screen was shared verbatim by both roots, so a facilities
        technician was shown construction registers and none of their own.

        No role logic decides this: a register that returns nothing is
        dropped, so each person sees only the registers they appear in.
        """
        technician = self.env["res.users"].create({
            "name": "FM Technician", "login": "myday.fm",
            "email": "myday.fm@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [
                self.env.ref("maintenance.group_equipment_manager").id,
                self.env.ref("base.group_user").id,
            ])],
        })
        asset = self.env["maintenance.equipment"].create({"name": "AHU-7"})
        self.env["maintenance.request"].create({
            "name": "No cooling on level 3",
            "equipment_id": asset.id,
            "user_id": technician.id,
        })
        # A construction defect belonging to the engineer, to prove the two
        # people do not see each other's work.
        self._defect(self.engineer)

        fm = self._my_day(technician)
        self.assertIsNotNone(self._section(fm, "work_orders"))
        # Still one: the engineer's defect raised a work order, but it went to
        # the engineer, not to this technician.
        self.assertEqual(self._section(fm, "work_orders")["count"], 1)
        self.assertIsNone(self._section(fm, "defects"))

        builder = self._my_day(self.engineer)
        self.assertIsNotNone(self._section(builder, "defects"))
        # The engineer does have a work order now — the one their own defect
        # raised, since a defect's assignee is who has to fix it. What they
        # must not see is the technician's, so the count is the boundary here
        # rather than the section's absence.
        self.assertEqual(self._section(builder, "work_orders")["count"], 1)

    def test_planned_maintenance_due_reaches_the_team_not_one_person(self):
        """A PM plan names an asset and a team, never a person."""
        technician = self.env["res.users"].create({
            "name": "PM Technician", "login": "myday.pm",
            "email": "myday.pm@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [
                self.env.ref("maintenance.group_equipment_manager").id,
                self.env.ref("base.group_user").id,
            ])],
        })
        team = self.env["maintenance.team"].create(
            {"name": "Mechanical", "member_ids": [(6, 0, [technician.id])]})
        asset = self.env["maintenance.equipment"].create({"name": "Chiller-2"})
        from odoo import fields as odoo_fields
        self.env["facility.pm.plan"].create({
            "name": "Quarterly service", "equipment_id": asset.id,
            "maintenance_team_id": team.id, "trigger_type": "calendar",
            "next_date": odoo_fields.Date.subtract(
                odoo_fields.Date.context_today(self.env.user), days=1),
        })

        section = self._section(self._my_day(technician), "pm_due")
        self.assertIsNotNone(section)
        self.assertEqual(section["count"], 1)
        self.assertEqual(section["urgent"], 1)

        # Somebody not on that team is not asked to do its work.
        self.assertIsNone(self._section(self._my_day(self.other), "pm_due"))

    def test_my_day_opens_for_a_user_with_no_construction_rights(self):
        """My Day is the home screen for everyone, and its registers span
        both halves of the product. A facilities technician has no rights on
        approval steps or defects, so every lookup here reads something they
        are not allowed to — unguarded that is an AccessError where a screen
        should be, and the whole screen fails rather than one row.
        """
        outsider = self.env["res.users"].create({
            "name": "No Construction Rights", "login": "myday.outsider",
            "email": "myday.outsider@majal.test",
            "company_id": self.env.company.id,
            "company_ids": [(6, 0, [self.env.company.id])],
            "groups_id": [(6, 0, [self.env.ref("base.group_user").id])],
        })
        payload = self._my_day(outsider)   # must not raise
        self.assertEqual(payload["user"], outsider.display_name)
        self.assertIsInstance(payload["sections"], list)
