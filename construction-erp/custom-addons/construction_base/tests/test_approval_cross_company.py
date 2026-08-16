"""An approval rule the signer cannot read must not take the screen down.

Approval rules are company-scoped by the tenant record rules, and the
defaults every install ships are created from `data/` with company_id
defaulting to whichever company happened to be active when the module was
installed. In a single-company database that is invisible. In a
multi-company one, every user outside the install company cannot read those
rules at all.

_can_be_signed_by traverses request_id.rule_id to check one policy flag. On
an unreadable rule that traversal raises AccessError, and because My Day
calls this for every step in the inbox, the entire home screen fails rather
than dropping a row. The screen already guards its lookups with
has_access(), but has_access() tests the model's ACL and this is a record
rule -- the ACL says yes and the rule then removes the row.

Found by opening My Day as the nine seeded demo personas: eight of the nine
got an error dialog, including the Platform Owner. The superuser is exempt
from record rules, which is why every previous check of this screen passed.
"""

from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged, new_test_user


@tagged("post_install", "-at_install")
class TestApprovalRuleCrossCompany(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.other = cls.env["res.company"].create({"name": "Other Co"})
        cls.home = cls.env["res.company"].create({"name": "Home Co"})
        # The tenant rules are installed by a hook, not by module data, so a
        # bare test database has none and the premise below would not hold.
        cls.env["res.users"]._majal_install_tenant_rules()

        cls.model = cls.env["ir.model"]._get("construction.rfi")
        cls.signer_group = cls.env.ref(
            "construction_base.group_construction_user")
        # The rule lives in a company our signer is not a member of, which is
        # exactly the shape of a shipped default in a multi-company database.
        # Its step needs somebody who can sign it, or the model refuses it.
        cls.rule = cls.env["construction.approval.rule"].create({
            "name": "Foreign default",
            "model_id": cls.model.id,
            "company_id": cls.other.id,
            "require_other_user": False,
            "step_ids": [(0, 0, {"name": "Sign", "sequence": 10,
                                 "group_id": cls.signer_group.id})],
        })

        cls.signer = new_test_user(
            cls.env, login="cross.signer",
            password="cross-signer-pw-2026",
            groups="construction_base.group_construction_user",
            company_id=cls.home.id,
            company_ids=[(6, 0, [cls.home.id])],
        )

    def _cold(self):
        """Drop the cache before reading as the signer.

        Odoo's cache hangs off the transaction, not the environment, so a
        field this fixture already touched as superuser is served straight
        from cache when the signer asks for it -- no record rule is consulted
        and no AccessError is raised. Without this, these tests pass whether
        or not the fix is in place, which is how the first version of them
        managed to be green against the unfixed code.
        """
        self.env.invalidate_all()

    def _step_for(self, signer):
        project = self.env["project.project"].create(
            {"name": "Cross Co", "is_construction": True,
             "company_id": self.home.id})
        rfi = self.env["construction.rfi"].create({
            "name": "Which detail applies?",
            "question": "<p>Which detail applies at grid E?</p>",
            "project_id": project.id,
        })
        request = self.env["construction.approval.request"].create({
            "rule_id": self.rule.id,
            "res_model": "construction.rfi",
            "res_id": rfi.id,
            "state": "pending",
            "requested_by_id": self.env.user.id,
        })
        return self.env["construction.approval.step"].create({
            "request_id": request.id,
            "name": "Sign",
            "sequence": 10,
            "user_id": signer.id,
            "state": "pending",
        })

    def test_the_signer_cannot_read_the_rule(self):
        """The premise. If this stops holding, the tests below prove nothing.

        Checked with search and with a field read rather than exists():
        exists() issues a plain row lookup and does not apply record rules,
        so it answers True for a record the caller cannot read — which made
        this assertion pass while testing nothing.
        """
        visible = self.env["construction.approval.rule"].with_user(
            self.signer).search([("id", "=", self.rule.id)])
        self.assertFalse(
            visible,
            "the tenant rule is no longer hiding another company's approval "
            "rule, so these tests are not exercising what they claim to")
        with self.assertRaises(AccessError):
            self.rule.with_user(self.signer).require_other_user

        # And the other half of the premise: the signer must be able to reach
        # the step and its request, or _can_be_signed_by never traverses to
        # the rule at all and these tests pass whether the fix is present or
        # not. An empty recordset answers False for require_other_user without
        # fetching anything, which is exactly how a green test can prove
        # nothing.
        step = self._step_for(self.signer)
        as_signer = step.with_user(self.signer)
        self.assertTrue(as_signer.exists() and as_signer.request_id.exists(),
                        "the signer cannot see their own step or its request, "
                        "so the rule traversal is never reached")
        self.assertTrue(
            as_signer.request_id.rule_id,
            "request.rule_id came back empty for the signer, so reading "
            "require_other_user costs nothing and proves nothing")

    def test_entitlement_survives_an_unreadable_rule(self):
        step = self._step_for(self.signer)
        self._cold()
        # The call the inbox makes, as the person whose inbox it is.
        self.assertTrue(
            step.with_user(self.signer)._can_be_signed_by(self.signer),
            "a signer entitled to sign was refused because the rule behind "
            "the step belongs to another company")

    def test_my_day_still_builds_for_that_user(self):
        """The failure that was actually visible: the whole screen, not a row."""
        self._step_for(self.signer)
        self._cold()
        payload = (self.env["construction.my.day"]
                   .with_user(self.signer).my_day())
        self.assertIn("sections", payload)

    def test_require_other_user_is_still_enforced(self):
        """sudo must not turn the policy off, only make it readable."""
        self.rule.require_other_user = True
        step = self._step_for(self.signer)
        step.request_id.requested_by_id = self.signer.id
        self._cold()
        self.assertFalse(
            step.with_user(self.signer)._can_be_signed_by(self.signer),
            "the requester signed their own document; require_other_user "
            "stopped being enforced once the rule was read with sudo")
