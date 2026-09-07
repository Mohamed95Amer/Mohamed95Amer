"""Inspection and test plans, and the one rule with teeth.

A hold point stops the work. Everything asserted here is about whether that
holds — including the case where it is deliberately waived, because hold
points do get waived on real jobs and a system that cannot record it honestly
gets worked around rather than used.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestItp(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "ITP Tower", "is_construction": True})
        cls.itp = cls.env["construction.itp"].create({
            "name": "Reinforced concrete substructure",
            "project_id": cls.project.id,
            "discipline": "civil",
            "activity": "RC foundations",
        })
        cls.hold = cls.env["construction.itp.point"].create({
            "itp_id": cls.itp.id, "sequence": 10,
            "name": "Rebar inspection before pour",
            "stage": "before", "point_type": "hold",
            "responsible_party": "consultant",
            "reference_standard": "SBC 304",
        })
        cls.witness = cls.env["construction.itp.point"].create({
            "itp_id": cls.itp.id, "sequence": 20,
            "name": "Concrete slump test",
            "stage": "during", "point_type": "witness",
        })

    def _record(self, point, **vals):
        return self.env["construction.itp.record"].create({
            "point_id": point.id, "location": "Pour F1 — grid A/1-4", **vals,
        })

    # ------------------------------------------------------------------
    # The plan
    # ------------------------------------------------------------------
    def test_a_plan_is_numbered_and_counts_its_hold_points(self):
        self.assertIn("-ITP-", self.itp.reference)
        self.assertEqual(self.itp.point_count, 2)
        self.assertEqual(self.itp.hold_point_count, 1)

    def test_an_empty_plan_cannot_be_approved(self):
        empty = self.env["construction.itp"].create(
            {"name": "Nothing", "project_id": self.project.id})
        with self.assertRaises(UserError):
            empty.action_approve()

    def test_a_point_says_what_kind_it_is(self):
        self.assertIn("Hold Point", self.hold.display_name)
        self.assertIn("Witness Point", self.witness.display_name)

    # ------------------------------------------------------------------
    # The rule with teeth
    # ------------------------------------------------------------------
    def test_a_hold_point_cannot_be_released_on_nothing(self):
        """Concrete does not get poured because somebody clicked a button."""
        record = self._record(self.hold)
        self.assertTrue(record.is_blocking)
        with self.assertRaises(UserError):
            record.action_release()
        self.assertEqual(record.state, "pending")

    def test_a_witness_point_can_be_released_on_a_note(self):
        """If the witness does not attend, the work proceeds."""
        record = self._record(self.witness)
        self.assertFalse(record.is_blocking)
        record.action_release()
        self.assertEqual(record.state, "released")
        self.assertEqual(record.signed_by_id, self.env.user)
        self.assertTrue(record.date_signed)

    def test_a_hold_point_releases_against_its_inspection(self):
        template = self.env["construction.form.template"].create(
            {"name": "Rebar check", "code": "REBAR"})
        self.env["construction.form.question"].create(
            {"template_id": template.id, "name": "Cover correct?",
             "section": "Rebar", "answer_type": "yes_no"})
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id, "project_id": self.project.id})
        inspection.action_start()
        inspection.answer_ids.answer_yes_no = "yes"
        inspection.action_submit()

        record = self._record(self.hold, inspection_id=inspection.id)
        record.action_release()
        self.assertEqual(record.state, "released")
        self.assertFalse(record.is_blocking)

    def test_a_hold_point_will_not_release_against_an_unfinished_inspection(self):
        template = self.env["construction.form.template"].create(
            {"name": "Rebar check 2", "code": "REBAR2"})
        self.env["construction.form.question"].create(
            {"template_id": template.id, "name": "Cover correct?",
             "section": "Rebar", "answer_type": "yes_no"})
        inspection = self.env["construction.form.inspection"].create({
            "template_id": template.id, "project_id": self.project.id})
        record = self._record(self.hold, inspection_id=inspection.id)
        with self.assertRaises(UserError):
            record.action_release()

    def test_a_waived_hold_point_records_who_authorised_it(self):
        """Hold points do get waived. A system that cannot say so honestly
        gets worked around instead of used."""
        record = self._record(
            self.hold,
            waiver_reason="Verbal release by Eng. Khalid, 14:20, to keep "
                          "the pour inside the concrete's working time.")
        record.action_release()
        self.assertEqual(record.state, "released")
        body = " ".join(m.body or "" for m in record.message_ids)
        self.assertIn("Khalid", body)
        self.assertIn("without inspection", body)

    # ------------------------------------------------------------------
    # What is blocking, and where
    # ------------------------------------------------------------------
    def test_the_project_counts_what_is_blocking(self):
        self._record(self.hold)
        self._record(self.witness)          # not a hold point
        self.project.invalidate_recordset()
        self.assertEqual(self.project.blocking_hold_point_count, 1)

        blocking = self.env["construction.itp.record"].search(
            self.project.action_view_hold_points()["domain"])
        self.assertEqual(len(blocking), 1)
        self.assertEqual(blocking.point_id, self.hold)

    def test_releasing_clears_the_block(self):
        record = self._record(self.hold, waiver_reason="Agreed on site.")
        self.project.invalidate_recordset()
        self.assertEqual(self.project.blocking_hold_point_count, 1)

        record.action_release()
        self.project.invalidate_recordset()
        self.assertEqual(self.project.blocking_hold_point_count, 0)

    def test_a_rejected_hold_point_is_not_blocking_but_is_not_released(self):
        """Rejected means the check failed — the work is stopped by the
        failure, not by an outstanding signature."""
        record = self._record(self.hold)
        record.action_reject()
        self.assertEqual(record.state, "rejected")
        self.assertFalse(record.is_blocking)

    def test_reopening_puts_the_block_back(self):
        record = self._record(self.witness)
        record.action_release()
        record.action_reopen()
        self.assertEqual(record.state, "pending")
        self.assertFalse(record.date_signed)
        self.assertFalse(record.signed_by_id)
