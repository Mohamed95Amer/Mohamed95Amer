from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
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
                "company_id": cls.env.company.id,
                "company_ids": [(6, 0, [cls.env.company.id])],
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

        # Put them on the job. The tenant rules scope every register by
        # membership, so four people with construction groups and no
        # connection to this project cannot see the document they are being
        # asked to approve. That used to work only because an unassigned
        # access level meant "see everything", which is the fail-open this
        # branch closed -- the fixture was relying on it without saying so.
        cls.project.write({
            "majal_manager_id": cls.pm.id,
            "majal_member_ids": [
                (6, 0, (cls.engineer | cls.qs | cls.boss).ids)],
        })

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

    def test_a_list_of_named_people_is_somebody_who_can_sign_it(self):
        """The third way of naming an approver has to satisfy the same
        constraint as the other two, or configuring a step this way is
        refused as empty."""
        rule = self.env["construction.approval.rule"].create({
            "name": "Either director", "model_id": self.model_id,
            "step_ids": [(0, 0, {
                "name": "A director",
                "user_ids": [(6, 0, (self.pm | self.boss).ids)]})]})
        self.assertEqual(len(rule.step_ids), 1)


@tagged("post_install", "-at_install")
class TestSeveralNamedApprovers(ApprovalCase):
    """"Either of these two people can sign" — as a role nobody maintains.

    A group is the better answer where the authority really is a role, but
    "whichever of our two directors is in the country" is not a role, and
    making it one means creating and maintaining a group of two.
    """

    def setUp(self):
        super().setUp()
        self.env["construction.approval.rule"].create({
            "name": "Either director", "model_id": self.model_id,
            "step_ids": [(0, 0, {
                "name": "A director",
                "user_ids": [(6, 0, (self.pm | self.boss).ids)]})]})
        self.request = self.boq.with_user(self.qs).action_request_approval()
        self.step = self.request.step_ids

    def test_the_named_people_are_carried_onto_the_request(self):
        """Copied, not related: editing the rule afterwards must not change
        who was entitled to sign a decision already outstanding."""
        self.assertEqual(self.step.user_ids, self.pm | self.boss)

    def test_either_of_them_can_sign(self):
        self.assertTrue(self.step._can_be_signed_by(self.pm))
        self.assertTrue(self.step._can_be_signed_by(self.boss))

    def test_one_signature_is_enough(self):
        """'Any of', not 'all of'. Two signatures is two steps."""
        self.step.with_user(self.boss).action_approve()
        self.assertEqual(self.request.state, "approved")

    def test_somebody_not_named_is_still_refused(self):
        self.assertFalse(self.step._can_be_signed_by(self.engineer))
        with self.assertRaises(UserError):
            self.step.with_user(self.engineer).action_approve()

    def test_it_reaches_both_their_inboxes(self):
        """The inbox domain ORs four entitlement leaves. Miscount the prefix
        operators and it silently ANDs the tail instead of raising, and the
        people in the dropped part simply never hear about the approval.
        """
        for approver in (self.pm, self.boss):
            waiting = self.env["construction.approval.step"].with_user(
                approver)._waiting_on(approver)
            self.assertIn(self.step, waiting, approver.name)

    def test_the_refusal_names_them_rather_than_a_group(self):
        reason = self.step._refusal_reason(self.engineer)
        self.assertIn(self.pm.display_name, reason)
        self.assertIn(self.boss.display_name, reason)


@tagged("post_install", "-at_install")
class TestBulkRequestForApproval(ApprovalCase):
    """Forty variations to submit used to mean forty documents opened."""

    def setUp(self):
        super().setUp()
        self._rule([("Project manager",
                     "construction_base.group_construction_pm")])
        self.second = self.env["construction.boq"].create(
            {"name": "Second bill", "project_id": self.project.id})

    def test_a_selection_is_sent_in_one_go(self):
        both = self.boq | self.second
        both.with_user(self.qs).action_request_approval_selected()
        for document in both:
            self.assertTrue(document._open_approval_request(), document.name)

    def test_one_that_cannot_be_sent_does_not_abort_the_rest(self):
        """The whole point. It used to raise on the first record already
        pending, having raised nothing at all, leaving the user to work out
        which of forty it was and deselect it.
        """
        self.boq.with_user(self.qs).action_request_approval()
        both = self.boq | self.second

        result = both.with_user(self.qs).action_request_approval_selected()

        self.assertTrue(self.second._open_approval_request())
        self.assertEqual(result["tag"], "display_notification")
        self.assertIn(self.boq.display_name, result["params"]["message"])

    def test_one_record_still_says_plainly_what_is_wrong(self):
        """Skipping is right for a selection and wrong for a single record:
        somebody who pressed the button on one document and got a summary
        saying one was skipped has been told nothing."""
        self.boq.with_user(self.qs).action_request_approval()
        with self.assertRaises(UserError):
            self.boq.with_user(self.qs).action_request_approval()


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


@tagged("post_install", "-at_install")
class TestApprovalCannotBeRoutedAround(ApprovalCase):
    """The engine is only worth having if the ordinary ways past it are shut.

    Each of these was open. The entitlement check existed and was correct; it
    simply was not the only road to the outcome.
    """

    def test_a_user_cannot_sign_a_step_by_writing_to_it(self):
        """The bypass: `_can_be_signed_by` guards `_decide`, and `_decide` was
        one of two ways to set the state. The other was a plain write, which
        every construction user held the rights for."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        step = request.step_ids[0]

        with self.assertRaises(AccessError):
            step.with_user(self.engineer).write({"state": "approved"})

        self.assertEqual(step.state, "pending")
        self.assertEqual(request.state, "pending")

    def test_a_forged_transition_key_does_not_unlock_the_document(self):
        """The step guard was closed; this is the same hole one door along.

        `majal_workflow_transition` used to be a plain True in the context, and
        context is supplied by the caller — so anybody with write access to an
        approvable document could set it and write `state` directly, skipping
        _check_approved() entirely. The engine was enforced on the step and
        left open on the document it protects.

        The exemption is now a private Python object. RPC carries JSON, so a
        remote caller can send the string, the number or the boolean of that
        key and none of them are the object.
        """
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        self.boq.with_user(self.qs).action_request_approval()

        for forged in (True, "WORKFLOW_TRANSITION", 1, {"": ""}):
            with self.assertRaises(AccessError):
                self.boq.with_user(self.qs).with_context(
                    majal_workflow_transition=forged
                ).write({"state": "approved"})

        self.assertNotEqual(self.boq.state, "approved")

    def test_asking_for_the_exemption_does_not_grant_it(self):
        """The step model's write guard once stood down for a context key.

        Context travels with the RPC call, so `majal_approval_transition` was
        something the guarded party could simply ask for — the guard held only
        against callers who did not know to set it. It is now `env.su`, which
        cannot be requested from outside: it is true only where server-side
        code has already called sudo(), which `_decide` does after the
        entitlement check rather than before it.

        The actor is a manager, and that is the point. An ordinary user is
        stopped by the ACL long before the guard is consulted, so testing with
        one passes whether the guard works or not — as the first version of
        this test did. Managers hold write on steps, which leaves this guard as
        the only thing between them and a signature on a step reserved for
        somebody else, recorded as legitimate.
        """
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        step = request.step_ids[0]

        with self.assertRaises(AccessError):
            step.with_user(self.boss).with_context(
                majal_approval_transition=True
            ).write({"state": "approved"})

        self.assertEqual(step.state, "pending")
        self.assertEqual(request.state, "pending")

    def test_a_user_cannot_approve_the_whole_request_by_writing_to_it(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(AccessError):
            request.with_user(self.engineer).write({"state": "approved"})

        self.assertEqual(request.state, "pending")

    def test_signing_through_the_proper_door_still_works(self):
        """The point of removing the write access is that nothing legitimate
        needed it — the decision path elevates itself after the check."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        request.step_ids.with_user(self.pm).action_approve()

        self.assertEqual(request.state, "approved")
        self.assertEqual(request.step_ids[0].decided_by_id, self.pm)

    def test_a_user_cannot_lend_themselves_somebody_elses_authority(self):
        """A delegation naming somebody else as the approver and yourself as
        the delegate is a way to take their signature, not to cover for them."""
        with self.assertRaises(ValidationError):
            self.env["construction.approval.delegation"].with_user(
                self.engineer).create({
                    "user_id": self.pm.id,
                    "delegate_id": self.engineer.id,
                    "date_from": "2020-01-01",
                    "date_to": "2099-01-01",
                })

    def test_handing_over_your_own_approvals_is_still_allowed(self):
        delegation = self.env["construction.approval.delegation"].with_user(
            self.pm).create({
                "user_id": self.pm.id,
                "delegate_id": self.engineer.id,
                "date_from": "2020-01-01",
                "date_to": "2099-01-01",
            })
        self.assertTrue(delegation)

    def test_only_the_requester_or_a_manager_can_withdraw(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        with self.assertRaises(UserError):
            request.with_user(self.engineer).action_cancel()

        request.with_user(self.qs).action_cancel()
        self.assertEqual(request.state, "cancelled")


@tagged("post_install", "-at_install")
class TestApprovalGoesStale(ApprovalCase):
    """An approval is of a document at a value, not of a document for ever."""

    def setUp(self):
        super().setUp()
        self._rule([("Project manager", "construction_base.group_construction_pm")],
                   amount_from=0, amount_to=50000, name="Small")
        self._rule([("Project manager", "construction_base.group_construction_pm"),
                    ("Board", "construction_base.group_construction_manager")],
                   amount_from=50000, amount_to=0, name="Large")
        self.line = self.env["construction.boq.line"].create({
            "name": "Works", "boq_id": self.boq.id,
            "quantity": 1.0, "unit_rate": 10000.0,
        })

    def test_editing_past_the_threshold_after_approval_needs_approving_again(self):
        """The cheapest way past a two-signature threshold was to get a small
        version signed and then edit it upward."""
        request = self.boq.with_user(self.qs).action_request_approval()
        request.step_ids.with_user(self.pm).action_approve()
        self.assertEqual(self.boq.state, "approved")

        self.boq.state = "draft"
        self.line.unit_rate = 400000.0

        with self.assertRaises(UserError):
            self.boq.with_user(self.pm).action_approve()

    def test_an_edit_inside_the_same_band_does_not_reopen_it(self):
        """Sending a document round again for a rounding change is how people
        learn to route around the engine."""
        request = self.boq.with_user(self.qs).action_request_approval()
        request.step_ids.with_user(self.pm).action_approve()

        self.boq.state = "draft"
        self.line.unit_rate = 11000.0

        self.boq.with_user(self.pm).action_approve()
        self.assertEqual(self.boq.state, "approved")


@tagged("post_install", "-at_install")
class TestWaitingDays(ApprovalCase):
    """It was stored, depended on nothing that changes, and so was always 0."""

    def test_a_step_outstanding_for_a_fortnight_says_so(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        # Backdating is arranging the fixture, not exercising the engine — and
        # a requester no longer holds write on their own request, which is the
        # point of the change above.
        request.sudo().requested_on = fields.Datetime.now() - timedelta(days=14)
        request.step_ids.invalidate_recordset()

        self.assertEqual(request.step_ids[0].waiting_days, 14)

    def test_the_over_a_week_filter_finds_it(self):
        """The filter is a domain on a field with no column, so it only works
        if the search method translates it back to a date."""
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()
        request.sudo().requested_on = fields.Datetime.now() - timedelta(days=14)

        found = self.env["construction.approval.step"].search(
            [("waiting_days", ">", 7)])

        self.assertIn(request.step_ids[0], found)

    def test_a_fresh_step_is_not_caught_by_it(self):
        self._rule([("Project manager", "construction_base.group_construction_pm")])
        request = self.boq.with_user(self.qs).action_request_approval()

        found = self.env["construction.approval.step"].search(
            [("waiting_days", ">", 7)])

        self.assertNotIn(request.step_ids[0], found)
