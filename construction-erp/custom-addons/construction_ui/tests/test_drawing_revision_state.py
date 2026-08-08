"""The sign-off gate on drawing revisions.

construction_drawing on its own makes a new revision current immediately.
This module layers a gate on top: a revision arrives superseded and is
promoted only once it has been signed off, so an unsigned drawing never
silently becomes the one the site is building to.

The gate is only observable with this module installed, which is why the
tests live here — construction_drawing's own suite runs without it and
branches around it.
"""

import base64

from odoo.exceptions import AccessError, UserError
from odoo.tests import TransactionCase, tagged
from odoo.addons.construction_ui.models.project_workspace import DRAWING_TRANSITION


@tagged("post_install", "-at_install")
class TestDrawingRevisionGate(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Revision Gate", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create({
            "name": "Setting Out Plan", "number": "CI-001",
            "project_id": cls.project.id})

    def _revision(self, letter):
        return self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": letter})

    def test_a_new_revision_is_not_live_until_it_is_signed_off(self):
        rev_a = self._revision("A")
        self.assertEqual(rev_a.state, "superseded")
        self.assertEqual(rev_a.approval_state, "draft")
        self.drawing.invalidate_recordset()
        self.assertFalse(self.drawing.current_revision_id)

    def test_signing_off_makes_it_the_current_revision(self):
        rev_a = self._revision("A")
        rev_a.approval_state = "approved"
        rev_a.action_make_current()
        self.assertEqual(rev_a.state, "current")
        self.drawing.invalidate_recordset()
        self.assertEqual(self.drawing.current_revision_id, rev_a)

    def test_a_signed_off_revision_supersedes_the_one_before_it(self):
        rev_a = self._revision("A")
        rev_a.approval_state = "approved"
        rev_a.action_make_current()

        rev_b = self._revision("B")
        self.assertEqual(rev_b.state, "superseded")   # still gated
        rev_a.invalidate_recordset()
        self.assertEqual(rev_a.state, "current")      # A is still the live one

        rev_b.approval_state = "approved"
        rev_b.action_make_current()
        rev_a.invalidate_recordset()
        self.assertEqual(rev_b.state, "current")
        self.assertEqual(rev_a.state, "superseded")
        self.drawing.invalidate_recordset()
        self.assertEqual(self.drawing.current_revision_id, rev_b)


@tagged("post_install", "-at_install")
class TestDrawingRevisionTransitionGuard(TransactionCase):
    """The context key that gates a drawing revision's approval state.

    `majal_drawing_transition` marks a write as coming from the workflow
    actions below, not from an arbitrary caller. Context travels with every
    RPC call and is supplied by the caller, so a guard that trusted a plain
    truthy value would let anybody holding write access on a revision --
    every site engineer, per the ACL -- set that key themselves and rewrite
    approval_state, or replace a submitted sheet, without ever going through
    _check_signoff_authority. This is the same hole construction.approvable
    closed with WORKFLOW_TRANSITION in approval_mixin.py, arriving by a
    second door on a model that mixin does not cover.

    The exemption is a private Python object instead: RPC only carries
    JSON, so a remote caller can send the string, the number or the boolean
    of that key and none of them are this object.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Transition Guard", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create({
            "name": "Setting Out Plan", "number": "TG-001",
            "project_id": cls.project.id})

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

        # A site engineer has full CRUD on construction.drawing.revision by
        # ACL -- the guard has to hold on write access alone, not on a group
        # the attacker is assumed to lack.
        cls.engineer = user(
            "tg_engineer", "construction_base.group_construction_site_engineer")
        cls.pm = user("tg_pm", "construction_base.group_construction_pm")

    def _revision(self, letter="A"):
        attachment = self.env["ir.attachment"].create({
            "name": f"{letter}.pdf",
            "datas": base64.b64encode(b"%PDF-1.4 test"),
        })
        return self.env["construction.drawing.revision"].create({
            "drawing_id": self.drawing.id, "revision": letter,
            "attachment_id": attachment.id,
        })

    def test_a_direct_state_change_without_the_transition_context_is_rejected(self):
        """(A) A protected write with no transition context at all."""
        revision = self._revision()
        with self.assertRaises(AccessError):
            revision.with_user(self.engineer).write({"approval_state": "approved"})
        self.assertEqual(revision.approval_state, "draft")

    def test_a_forged_transition_key_does_not_unlock_the_document(self):
        """(B) The old hole: a plain `True` used to satisfy this guard."""
        revision = self._revision()
        for forged in (True, "DRAWING_TRANSITION", 1, {"": ""}):
            with self.assertRaises(AccessError):
                revision.with_user(self.engineer).with_context(
                    majal_drawing_transition=forged
                ).write({"approval_state": "approved"})
        self.assertEqual(revision.approval_state, "draft")

    def test_a_forged_transition_key_cannot_replace_a_submitted_sheet(self):
        """(C) The second guard clause has no superuser exemption either --
        only the sentinel opens it, so this holds even without with_user."""
        revision = self._revision()
        revision.with_context(majal_drawing_transition=DRAWING_TRANSITION).write({
            "approval_state": "submitted",
            "submitted_by_id": self.engineer.id,
        })
        original = revision.attachment_id
        swapped = self.env["ir.attachment"].create({
            "name": "swapped.pdf",
            "datas": base64.b64encode(b"%PDF-1.4 swapped"),
        })
        for forged in (True, "DRAWING_TRANSITION", 1, {"": ""}):
            with self.assertRaises(UserError):
                revision.with_context(
                    majal_drawing_transition=forged
                ).write({"attachment_id": swapped.id})
        self.assertEqual(revision.attachment_id, original)

    def test_the_private_sentinel_still_completes_the_legitimate_transition(self):
        """(D) The internal path -- the real object, not a lookalike -- works."""
        revision = self._revision()
        revision.with_context(majal_drawing_transition=DRAWING_TRANSITION).write({
            "approval_state": "submitted",
            "submitted_by_id": self.engineer.id,
        })
        self.assertEqual(revision.approval_state, "submitted")

    def test_the_sign_off_actions_still_work_end_to_end(self):
        """(E) The guard protects the door; it must not also jam the workflow
        that is supposed to walk through it."""
        revision = self._revision()
        revision.with_user(self.engineer).action_submit_approval()
        self.assertEqual(revision.approval_state, "submitted")
        self.assertEqual(revision.submitted_by_id, self.engineer)

        revision.with_user(self.pm).action_approve_revision()
        self.assertEqual(revision.approval_state, "approved")
        self.assertEqual(revision.approved_by_id, self.pm)

        revision.action_make_current()
        self.assertEqual(revision.state, "current")
