from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestSubmittal(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.reviewer = cls.env["res.users"].create(
            {
                "name": "Consultant Reviewer",
                "login": "reviewer@example.com",
                "email": "reviewer@example.com",
                "company_id": cls.env.company.id,
                "company_ids": [(6, 0, [cls.env.company.id])],
                "groups_id": [
                    (4, cls.env.ref("base.group_user").id),
                    (4, cls.env.ref(
                        "construction_base.group_construction_pm"
                    ).id),
                ],
            }
        )
        cls.project = cls.env["project.project"].create(
            {"name": "Submittal Test Project", "is_construction": True}
        )
        cls.submittal = cls.env["construction.submittal"].create(
            {
                "name": "Test material approval",
                "project_id": cls.project.id,
            }
        )

    def _add_tier_definition(self):
        return self.env["tier.definition"].create(
            {
                "name": "Consultant review",
                "model_id": self.env["ir.model"]._get("construction.submittal").id,
                "review_type": "individual",
                "reviewer_id": self.reviewer.id,
                "definition_domain": "[]",
            }
        )

    def test_reference_and_defaults(self):
        self.assertIn("-SUB-", self.submittal.reference)
        self.assertEqual(self.submittal.revision, "A")
        self.assertEqual(self.submittal.state, "draft")

    def test_tier_validation_blocks_unreviewed_approval(self):
        self._add_tier_definition()
        self.submittal.action_submit()
        self.assertEqual(self.submittal.state, "submitted")
        self.assertTrue(self.submittal.review_ids)
        with self.assertRaises(ValidationError):
            self.submittal.action_approve()
        # Reviewer validates, approval now passes
        self.submittal.with_user(self.reviewer).validate_tier()
        self.submittal.action_approve()
        self.assertEqual(self.submittal.state, "approved")
        self.submittal.action_close()
        self.assertEqual(self.submittal.state, "closed")

    def test_revise_resubmit_spawns_next_revision(self):
        self.submittal.action_submit()
        next_rev = self.submittal.action_revise_resubmit()
        self.assertEqual(self.submittal.state, "revise_resubmit")
        self.assertEqual(next_rev.revision, "B")
        self.assertEqual(next_rev.state, "draft")
        self.assertEqual(next_rev.previous_revision_id, self.submittal)
        self.assertEqual(self.submittal.next_revision_id, next_rev)
        self.assertNotEqual(next_rev.reference, self.submittal.reference)

    def test_invalid_transitions(self):
        with self.assertRaises(UserError):
            self.submittal.action_approve()
        with self.assertRaises(UserError):
            self.submittal.action_close()
