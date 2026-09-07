"""The approval inbox opens for the people who have approvals waiting.

"Waiting for Me" is an ir.actions.server. A server action with no groups_id
falls back, in ir.actions.server.run, to requiring *write* on its own model,
and only the manager group has write on construction.approval.step. So every
ordinary approver -- site engineer, field user, PM -- clicked the menu and
got an access error naming a group they are not in, while the list behind it
is read-only and contains nothing but their own pending decisions.

The action is asserted through run() rather than by reading groups_id, so
the test exercises the same access check the browser does. Reading the field
would pass against a groups_id that named the wrong group.
"""

from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestApprovalInboxAction(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.action = cls.env.ref("construction_base.action_approval_inbox")
        cls.approver = new_test_user(
            cls.env, login="inbox.approver",
            password="inbox-approver-pw-2026-long",
            groups="construction_base.group_construction_user")
        cls.manager = new_test_user(
            cls.env, login="inbox.manager",
            password="inbox-manager-pw-2026-long",
            groups="construction_base.group_construction_manager")

    def _run(self, user):
        self.env.invalidate_all()
        return self.action.with_user(user).with_context(
            active_model="construction.approval.step", active_ids=[]).run()

    def test_an_ordinary_approver_can_open_the_inbox(self):
        action = self._run(self.approver)
        self.assertEqual(action["res_model"], "construction.approval.step")

    def test_a_manager_can_open_the_inbox(self):
        action = self._run(self.manager)
        self.assertEqual(action["res_model"], "construction.approval.step")

    def test_somebody_outside_construction_cannot(self):
        """The gate is a real gate, not an open door.

        Dropping groups_id entirely would also make the first test pass for
        a manager and fail for nobody worth protecting; naming the group has
        to keep an unrelated internal user out.
        """
        outsider = new_test_user(
            self.env, login="inbox.outsider",
            password="inbox-outsider-pw-2026-long", groups="base.group_user")
        with self.assertRaises(AccessError):
            self._run(outsider)

    def test_the_inbox_is_read_only_for_an_ordinary_approver(self):
        """Why opening it must not require write in the first place.

        If this ever starts passing write, the fallback the fix removed was
        not wrong and the ACL is what changed -- which is a decision, not a
        detail, so it should fail here and be looked at.
        """
        self.assertFalse(
            self.env["construction.approval.step"]
            .with_user(self.approver).has_access("write"))
