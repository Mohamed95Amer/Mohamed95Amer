from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


class ApprovalCase(TransactionCase):
    """A model to approve, and people with different authority."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Approvals", "is_construction": True,
             "project_code": "APR"})

        def user(login, group):
            return cls.env["res.users"].create({
                "name": login, "login": login, "email": f"{login}@majal.test",
                "groups_id": [(6, 0, [
                    cls.env.ref("base.group_user").id,
                    cls.env.ref(group).id,
                ])],
            })

        cls.engineer = user("apr_engineer",
                            "construction_base.group_construction_site_engineer")
        cls.qs = user("apr_qs", "construction_base.group_construction_commercial")
        cls.pm = user("apr_pm", "construction_base.group_construction_pm")
        cls.boss = user("apr_boss", "construction_base.group_construction_manager")

        # A stand-in document: the engine must work on anything that inherits
        # the mixin, and testing it through one concrete model would test that
        # model's workflow as much as the engine.
        cls.model_id = cls.env["ir.model"]._get_id("construction.boq")
        # The module ships demo rules, and a test that says "no rule covers
        # this" has to mean it. Archived rather than deleted so the demo data
        # is still there for anything that looks at it.
        cls.env["construction.approval.rule"].search([]).write({"active": False})
        # The demo also leaves one variation deliberately unsigned, so the
        # approval screens are not empty in a demo database. Archiving the
        # rules does not touch a request already raised against them, and its
        # step would show up in every inbox assertion below.
        cls.env["construction.approval.request"].search(
            [("state", "=", "pending")]).action_cancel()
        cls.boq = cls.env["construction.boq"].create(
            {"name": "Main bill", "project_id": cls.project.id})

    def _rule(self, steps, amount_from=0.0, amount_to=0.0, **values):
        return self.env["construction.approval.rule"].create({
            "name": values.pop("name", "Test rule"),
            "model_id": self.model_id,
            "amount_from": amount_from,
            "amount_to": amount_to,
            "step_ids": [
                (0, 0, {"sequence": (index + 1) * 10, "name": name,
                        "group_id": self.env.ref(group).id})
                for index, (name, group) in enumerate(steps)
            ],
            **values,
        })


@tagged("post_install", "-at_install")
class TestApprovalEnforcement(ApprovalCase):
    """The hole this was built to close.

    A `groups` attribute on a button is a UI instruction. It hid the approve
    button from a commercial user and left the method callable, so the person
    who wrote the bill could approve the bill from a script.
    """

    def test_a_document_under_a_rule_cannot_be_approved_directly(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])

        with self.assertRaises(UserError):
            self.boq.with_user(self.qs).action_approve()
        self.assertEqual(self.boq.state, "draft")

    def test_the_check_holds_for_a_user_who_would_pass_the_button_test(self):
        """Even a PM cannot skip the request. The rule is the rule."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])

        with self.assertRaises(UserError):
            self.boq.with_user(self.pm).action_approve()

    def test_a_document_no_rule_covers_is_left_alone(self):
        """A suite with no rules written must still work.

        Refusing everything until somebody configures approvals would only get
        the rules written badly and in a hurry.
        """
        self.boq.with_user(self.pm).action_approve()
        self.assertEqual(self.boq.state, "approved")

    def test_approval_clears_the_document(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        request.step_ids.with_user(self.pm).action_approve()

        self.boq.invalidate_recordset()
        self.assertEqual(request.state, "approved")
        self.assertEqual(self.boq.state, "approved")


@tagged("post_install", "-at_install")
class TestApprovalChain(ApprovalCase):
    def test_steps_are_signed_in_order(self):
        """Otherwise a chain can be signed from the bottom up."""
        self._rule([
            ("Project manager", "construction_base.group_construction_pm"),
            ("Commercial manager", "construction_base.group_construction_manager"),
        ])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            request.step_ids[1].with_user(self.boss).action_approve()

        request.step_ids[0].with_user(self.pm).action_approve()
        request.step_ids[1].with_user(self.boss).action_approve()
        self.assertEqual(request.state, "approved")

    def test_the_author_cannot_approve_their_own_document(self):
        """The control an auditor asks for first."""
        self._rule([("Commercial", "construction_base.group_construction_commercial")])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            request.step_ids.with_user(self.qs).action_approve()

    def test_the_author_rule_can_be_turned_off_where_it_does_not_apply(self):
        """A daily log approved by the person who wrote it is normal."""
        self._rule(
            [("Commercial", "construction_base.group_construction_commercial")],
            require_other_user=False)
        request = self.boq.with_user(self.qs).action_request_approval()

        request.step_ids.with_user(self.qs).action_approve()

        self.assertEqual(request.state, "approved")

    def test_somebody_outside_the_group_is_refused(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            request.step_ids.with_user(self.engineer).action_approve()

    def test_a_refusal_says_which_rule_stopped_them(self):
        """'Access denied' teaches nobody what to do next."""
        self._rule([
            ("Project manager", "construction_base.group_construction_pm"),
            ("Commercial manager", "construction_base.group_construction_manager"),
        ])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError) as caught:
            request.step_ids[1].with_user(self.boss).action_approve()
        self.assertIn("Project manager", str(caught.exception))

    def test_rejecting_needs_a_reason(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            request.step_ids.with_user(self.pm).action_reject()

        request.step_ids.with_user(self.pm).action_reject("Rates are out of date")
        self.assertEqual(request.state, "rejected")
        self.assertEqual(request.step_ids.reason, "Rates are out of date")

    def test_a_rejection_stops_the_rest_of_the_chain(self):
        self._rule([
            ("Project manager", "construction_base.group_construction_pm"),
            ("Commercial manager", "construction_base.group_construction_manager"),
        ])
        request = self.boq.with_user(self.qs).action_request_approval()

        request.step_ids[0].with_user(self.pm).action_reject("No")

        self.assertEqual(request.state, "rejected")
        self.assertEqual(request.step_ids[1].state, "skipped")

    def test_asking_twice_is_refused(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            self.boq.with_user(self.qs).action_request_approval()


@tagged("post_install", "-at_install")
class TestApprovalRules(ApprovalCase):
    """Thresholds as data. The CEO changes a number, not a developer."""

    def test_the_band_decides_how_many_signatures(self):
        self._rule([("PM", "construction_base.group_construction_pm")],
                   amount_to=50000, name="Small")
        self._rule([("PM", "construction_base.group_construction_pm"),
                    ("Board", "construction_base.group_construction_manager")],
                   amount_from=50000, name="Large")

        small = self.env["construction.approval.rule"]._match(self.boq, 10000)
        large = self.env["construction.approval.rule"]._match(self.boq, 120000)

        self.assertEqual(small.name, "Small")
        self.assertEqual(len(large.step_ids), 2)

    def test_bands_meet_exactly_once(self):
        """Written 0–50k and 50k–up, fifty thousand belongs to the upper band
        and to nothing else."""
        self._rule([("PM", "construction_base.group_construction_pm")],
                   amount_to=50000, name="Lower")
        self._rule([("Board", "construction_base.group_construction_manager")],
                   amount_from=50000, name="Upper")

        self.assertEqual(
            self.env["construction.approval.rule"]._match(self.boq, 50000).name,
            "Upper")
        self.assertEqual(
            self.env["construction.approval.rule"]._match(self.boq, 49999.99).name,
            "Lower")

    def test_a_project_rule_beats_a_company_wide_one(self):
        """A job with an unusual delegation of authority without disturbing
        the rest."""
        self._rule([("PM", "construction_base.group_construction_pm")],
                   name="Everywhere")
        self._rule([("Board", "construction_base.group_construction_manager")],
                   name="This job only", project_id=self.project.id)

        matched = self.env["construction.approval.rule"]._match(self.boq, 1000)

        self.assertEqual(matched.name, "This job only")

    def test_a_rule_with_no_steps_is_refused(self):
        with self.assertRaises(ValidationError):
            self.env["construction.approval.rule"].create({
                "name": "Approves nothing", "model_id": self.model_id})

    def test_a_step_needs_somebody_who_can_sign_it(self):
        with self.assertRaises(ValidationError):
            self.env["construction.approval.rule"].create({
                "name": "Nobody", "model_id": self.model_id,
                "step_ids": [(0, 0, {"name": "Ghost"})]})


@tagged("post_install", "-at_install")
class TestApprovalDelegation(ApprovalCase):
    """Somebody is away and everything stops."""

    def _delegate(self, approver, delegate, days_from=-1, days_to=1):
        from datetime import timedelta

        from odoo import fields as odoo_fields
        today = odoo_fields.Date.context_today(self.env.user)
        return self.env["construction.approval.delegation"].create({
            "user_id": approver.id,
            "delegate_id": delegate.id,
            "date_from": today + timedelta(days=days_from),
            "date_to": today + timedelta(days=days_to),
        })

    def test_a_delegate_can_sign(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        self._delegate(self.pm, self.engineer)

        request.step_ids.with_user(self.engineer).action_approve()

        self.assertEqual(request.state, "approved")

    def test_the_signature_records_whose_authority_was_used(self):
        """What sharing a login destroys."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        self._delegate(self.pm, self.engineer)

        request.step_ids.with_user(self.engineer).action_approve()

        step = request.step_ids
        self.assertEqual(step.decided_by_id, self.engineer)
        self.assertEqual(step.delegated_from_id, self.pm)

    def test_a_delegation_that_has_expired_does_not_work(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        self._delegate(self.pm, self.engineer, days_from=-10, days_to=-5)

        with self.assertRaises(UserError):
            request.step_ids.with_user(self.engineer).action_approve()

    def test_delegating_to_yourself_is_refused(self):
        with self.assertRaises(ValidationError):
            self._delegate(self.pm, self.pm)


@tagged("post_install", "-at_install")
class TestApprovalInbox(ApprovalCase):
    """One list across every kind of document."""

    def test_the_inbox_shows_only_the_step_that_can_be_signed_now(self):
        """A later step is not in anybody's inbox until its turn.

        The manager appears here because the manager group *implies* the
        project-manager group, so they are genuinely entitled to sign step one.
        Seniority signing a junior step is usually wanted; where it is not, the
        rule should name a specific person rather than a group that others
        inherit.
        """
        self._rule([
            ("Project manager", "construction_base.group_construction_pm"),
            ("Commercial manager", "construction_base.group_construction_manager"),
        ])
        request = self.boq.with_user(self.qs).action_request_approval()
        step_model = self.env["construction.approval.step"]

        self.assertEqual(step_model._waiting_on(self.pm), request.step_ids[0])
        self.assertEqual(step_model._waiting_on(self.boss), request.step_ids[0])
        self.assertFalse(step_model._waiting_on(self.engineer))

    def test_a_signed_step_leaves_the_inbox_and_the_next_arrives(self):
        self._rule([
            ("Project manager", "construction_base.group_construction_pm"),
            ("Commercial manager", "construction_base.group_construction_manager"),
        ])
        request = self.boq.with_user(self.qs).action_request_approval()
        step_model = self.env["construction.approval.step"]

        request.step_ids[0].with_user(self.pm).action_approve()

        self.assertFalse(step_model._waiting_on(self.pm))
        self.assertEqual(len(step_model._waiting_on(self.boss)), 1)

    def test_a_delegate_sees_the_inbox_too(self):
        """Otherwise they are covering for somebody without being told what."""
        from datetime import timedelta

        from odoo import fields as odoo_fields
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        self.boq.with_user(self.qs).action_request_approval()
        today = odoo_fields.Date.context_today(self.env.user)
        self.env["construction.approval.delegation"].create({
            "user_id": self.pm.id, "delegate_id": self.engineer.id,
            "date_from": today - timedelta(days=1),
            "date_to": today + timedelta(days=1),
        })

        self.assertEqual(
            len(self.env["construction.approval.step"]._waiting_on(self.engineer)), 1)

    def test_the_inbox_carries_what_is_needed_to_decide(self):
        """A list of a hundred decisions should not open a hundred documents."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        step = request.step_ids
        self.assertEqual(step.record_reference, self.boq.display_name)
        self.assertEqual(step.res_model, "construction.boq")
        self.assertEqual(step.project_id, self.project)
        self.assertEqual(step.requested_by_id, self.qs)

    def test_a_batch_decision_signs_everything_selected(self):
        """Most of what an approver faces is routine, and making them open
        each one is how the four that matter get rubber-stamped."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        second = self.env["construction.boq"].create(
            {"name": "Second bill", "project_id": self.project.id})
        first_request = self.boq.with_user(self.qs).action_request_approval()
        second_request = second.with_user(self.qs).action_request_approval()
        steps = first_request.step_ids | second_request.step_ids

        wizard = self.env["construction.approval.decision"].with_user(self.pm).create(
            {"step_ids": [(6, 0, steps.ids)], "decision": "approved"})
        wizard.action_confirm()

        self.assertEqual(first_request.state, "approved")
        self.assertEqual(second_request.state, "approved")
