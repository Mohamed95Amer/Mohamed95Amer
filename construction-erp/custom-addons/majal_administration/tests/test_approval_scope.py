"""Approvals belong to their company, and still reach the person who signs.

construction.approval.step and construction.approval.request shipped with an
ACL granting read to every construction user and no record rule at all. The
effect was demonstrated through the server rather than inferred: two demo
personas in the contracting company each read all nine approval steps in a
database where every one of them hung off a project owned by a different
company -- document reference, step name, and 36.7M of amounts.

Both directions are tested here, because the obvious fix breaks the feature.
An approver is frequently not a member of the project they sign for: a
director approving a variation does not work on that job. A rule scoped
purely by company or project would close the leak and empty the inbox at the
same time, and a test that only checked the leak would call that a success.
"""

from odoo.tests import TransactionCase, tagged, new_test_user


@tagged("post_install", "-at_install")
class TestApprovalScope(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ours = cls.env["res.company"].create({"name": "Ours"})
        cls.theirs = cls.env["res.company"].create({"name": "Theirs"})
        cls.env["res.users"]._majal_install_tenant_rules()

        cls.group = cls.env.ref("construction_base.group_construction_user")

        def user(login, company):
            return new_test_user(
                cls.env, login=login, password=f"{login}-pw-2026-long",
                groups="construction_base.group_construction_user",
                company_id=company.id, company_ids=[(6, 0, [company.id])])

        cls.insider = user("scope.insider", cls.ours)
        cls.director = user("scope.director", cls.ours)
        cls.outsider = user("scope.outsider", cls.theirs)

        # A project in the other company, with an approval on it. The insider
        # is in neither the project nor its company.
        cls.foreign_project = cls.env["project.project"].create({
            "name": "Their Tower", "is_construction": True,
            "company_id": cls.theirs.id})
        cls.foreign_step = cls._approval(cls, cls.foreign_project, amount=9_000_000)

        # And one at home, which the insider's company owns.
        cls.home_project = cls.env["project.project"].create({
            "name": "Our Tower", "is_construction": True,
            "company_id": cls.ours.id})
        cls.home_step = cls._approval(cls, cls.home_project, amount=1_000)

    def _approval(self, project, amount, named=None):
        """One pending step on a document in `project`."""
        rfi = self.env["construction.rfi"].create({
            "name": "Detail query",
            "question": "<p>Which detail applies?</p>",
            "project_id": project.id,
        })
        request = self.env["construction.approval.request"].create({
            "res_model": "construction.rfi",
            "res_id": rfi.id,
            "project_id": project.id,
            "amount": amount,
            "state": "pending",
        })
        return self.env["construction.approval.step"].create({
            "request_id": request.id,
            "name": "Sign",
            "sequence": 10,
            "user_id": named.id if named else False,
            "state": "pending",
        })

    def _steps_visible_to(self, user):
        self.env.invalidate_all()
        return self.env["construction.approval.step"].with_user(user).search([])

    # ------------------------------------------------------------------
    # The leak
    # ------------------------------------------------------------------
    def test_another_companys_approvals_are_not_readable(self):
        visible = self._steps_visible_to(self.insider)
        self.assertNotIn(
            self.foreign_step, visible,
            "a user in one company can still read an approval step belonging "
            "to another company's project")

    def test_the_amount_does_not_leak_either(self):
        """search() hiding it is not enough if a direct read still answers."""
        from odoo.exceptions import AccessError
        self.env.invalidate_all()
        with self.assertRaises(AccessError):
            self.foreign_step.with_user(self.insider).amount

    def test_own_company_approvals_stay_readable(self):
        visible = self._steps_visible_to(self.insider)
        self.assertIn(
            self.home_step, visible,
            "company isolation is now hiding approvals from the company that "
            "owns them")

    # ------------------------------------------------------------------
    # The inbox, which the obvious fix would have emptied
    # ------------------------------------------------------------------
    def test_a_named_approver_sees_a_step_outside_their_company(self):
        """The case that makes a company-only rule wrong.

        A director signs a variation on a job they have nothing to do with.
        If entitlement did not have its own leg, this step would vanish from
        their inbox and the approval would stall with nobody able to see it.
        """
        step = self._approval(self.foreign_project, amount=500_000,
                              named=self.director)
        self.assertIn(step, self._steps_visible_to(self.director))

    def test_a_group_approver_inside_the_company_sees_the_step(self):
        request = self.home_step.request_id
        step = self.env["construction.approval.step"].create({
            "request_id": request.id, "name": "Group sign",
            "sequence": 20, "group_id": self.group.id, "state": "pending"})
        self.assertIn(step, self._steps_visible_to(self.insider),
                      "a step assigned to a group the user belongs to is "
                      "hidden from them inside their own company")

    def test_group_membership_does_not_cross_the_company_boundary(self):
        """The hole the first version of this rule left open.

        A step saying "any member of Construction Manager" names half the
        staff, and a group leg with no company qualifier let that carry into
        other companies -- the operations manager went on reading all nine of
        another company's approvals with the rule supposedly in place. Group
        approvers inside the company are covered by the company leg instead.
        """
        request = self.home_step.request_id
        step = self.env["construction.approval.step"].create({
            "request_id": request.id, "name": "Group sign",
            "sequence": 30, "group_id": self.group.id, "state": "pending"})
        self.assertNotIn(
            step, self._steps_visible_to(self.outsider),
            "belonging to the approving group let a user in another company "
            "read this approval")

    def test_a_delegate_sees_what_they_are_covering(self):
        """Delegation is not visible in the step's own fields."""
        step = self._approval(self.foreign_project, amount=250_000,
                              named=self.director)
        self.env["construction.approval.delegation"].create({
            "user_id": self.director.id,
            "delegate_id": self.insider.id,
            "date_from": "2020-01-01",
            "date_to": "2999-12-31",
        })
        self.assertIn(
            step, self._steps_visible_to(self.insider),
            "a delegate cannot see the step whose authority they hold, so "
            "the delegation does nothing")

    def test_the_requester_can_watch_their_own_document(self):
        rfi = self.env["construction.rfi"].create({
            "name": "Mine", "question": "<p>?</p>",
            "project_id": self.foreign_project.id})
        request = self.env["construction.approval.request"].with_user(
            self.insider).sudo().create({
                "res_model": "construction.rfi", "res_id": rfi.id,
                "project_id": self.foreign_project.id,
                "requested_by_id": self.insider.id, "state": "pending"})
        self.env.invalidate_all()
        visible = self.env["construction.approval.request"].with_user(
            self.insider).search([])
        self.assertIn(request, visible,
                      "whoever raised a document cannot see its approval")
