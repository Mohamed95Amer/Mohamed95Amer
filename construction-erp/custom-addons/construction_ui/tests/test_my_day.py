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
            "groups_id": [(6, 0, [
                cls.env.ref("construction_base.group_construction_site_engineer").id,
                cls.env.ref("base.group_user").id,
            ])],
        })
        cls.other = cls.env["res.users"].create({
            "name": "Somebody Else", "login": "myday.other",
            "groups_id": [(6, 0, [
                cls.env.ref("construction_base.group_construction_site_engineer").id,
                cls.env.ref("base.group_user").id,
            ])],
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
