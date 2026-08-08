"""What was issued, to whom, and when — and that it stays that way.

Most of what is asserted here is immutability. A transmittal exists to answer
a contractual question months later; a record that can be quietly edited
afterwards answers nothing.
"""

from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestTransmittal(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.consultant = cls.env["res.partner"].create({"name": "Consultant"})
        cls.contractor = cls.env["res.partner"].create({"name": "Contractor"})
        cls.project = cls.env["project.project"].create(
            {"name": "Transmittal Tower", "is_construction": True})
        cls.drawing = cls.env["construction.drawing"].create({
            "name": "Ground Floor Plan", "number": "AR-101",
            "project_id": cls.project.id})
        cls.rev_a = cls.env["construction.drawing.revision"].create(
            {"drawing_id": cls.drawing.id, "revision": "A"})

    def _publish(self, drawing, letter):
        """Create a revision and make it the live one.

        A sign-off layer (construction_ui) holds new revisions as superseded
        until they are approved, so a test that needs a *current* revision
        has to go through the gate rather than assume there isn't one.
        """
        revision = self.env["construction.drawing.revision"].create(
            {"drawing_id": drawing.id, "revision": letter})
        if "approval_state" in revision._fields:
            revision.approval_state = "approved"
            revision.action_make_current()
        return revision

    def _transmittal(self, revisions=None, **vals):
        return self.env["construction.transmittal"].create({
            "project_id": self.project.id,
            "recipient_id": self.contractor.id,
            "revision_ids": [(6, 0, (revisions or self.rev_a).ids)],
            **vals,
        })

    def test_a_transmittal_is_numbered_per_project(self):
        transmittal = self._transmittal()
        self.assertIn("-TRN-", transmittal.reference)
        self.assertEqual(transmittal.revision_count, 1)

    def test_issuing_records_what_went_where(self):
        transmittal = self._transmittal(purpose="approval", method="courier")
        transmittal.action_issue()
        self.assertEqual(transmittal.state, "issued")
        body = " ".join(m.body or "" for m in transmittal.message_ids)
        self.assertIn("Contractor", body)
        self.assertIn("Courier", body)

    def test_an_empty_transmittal_cannot_be_issued(self):
        """It would record nothing while looking like evidence."""
        transmittal = self._transmittal()
        transmittal.revision_ids = [(5, 0, 0)]
        with self.assertRaises(UserError):
            transmittal.action_issue()

    # ------------------------------------------------------------------
    # Immutability — the point of the register
    # ------------------------------------------------------------------
    def test_what_was_issued_cannot_be_changed_afterwards(self):
        rev_b = self.env["construction.drawing.revision"].create(
            {"drawing_id": self.drawing.id, "revision": "B"})
        transmittal = self._transmittal()
        transmittal.action_issue()
        with self.assertRaises(UserError):
            transmittal.revision_ids = [(4, rev_b.id)]

    def test_who_it_went_to_cannot_be_changed_afterwards(self):
        transmittal = self._transmittal()
        transmittal.action_issue()
        with self.assertRaises(UserError):
            transmittal.recipient_id = self.consultant

    def test_the_purpose_and_date_cannot_be_changed_afterwards(self):
        transmittal = self._transmittal(purpose="information")
        transmittal.action_issue()
        with self.assertRaises(UserError):
            transmittal.purpose = "construction"
        with self.assertRaises(UserError):
            transmittal.date_issued = "2020-01-01"

    def test_a_draft_can_still_be_corrected(self):
        """Immutability starts at issue, not at creation."""
        transmittal = self._transmittal()
        transmittal.recipient_id = self.consultant
        transmittal.purpose = "tender"
        self.assertEqual(transmittal.recipient_id, self.consultant)

    def test_notes_can_still_be_added_after_issue(self):
        """The record of what was sent is frozen; the conversation is not."""
        transmittal = self._transmittal()
        transmittal.action_issue()
        transmittal.notes = "Chased by phone on the 4th."
        self.assertIn("Chased", transmittal.notes)

    # ------------------------------------------------------------------
    # Acknowledgement
    # ------------------------------------------------------------------
    def test_acknowledgement_is_stamped(self):
        transmittal = self._transmittal()
        transmittal.action_issue()
        transmittal.action_acknowledge(acknowledged_by="A. Rahman")
        self.assertEqual(transmittal.state, "acknowledged")
        self.assertTrue(transmittal.date_acknowledged)
        self.assertEqual(transmittal.acknowledged_by, "A. Rahman")

    def test_an_acknowledged_transmittal_cannot_be_cancelled(self):
        """Cancelling would delete the recipient's own confirmation."""
        transmittal = self._transmittal()
        transmittal.action_issue()
        transmittal.action_acknowledge()
        with self.assertRaises(UserError):
            transmittal.action_cancel()

    def test_only_an_issued_transmittal_can_be_acknowledged(self):
        transmittal = self._transmittal()
        with self.assertRaises(UserError):
            transmittal.action_acknowledge()

    # ------------------------------------------------------------------
    # The failure it exists to catch
    # ------------------------------------------------------------------
    def test_a_revision_superseded_since_issue_is_flagged(self):
        """The recipient is building to something out of date.

        Uses its own drawing, and publishes each revision through the helper
        rather than assuming a fresh one is current: with a sign-off layer
        installed a revision arrives superseded and is promoted only once it
        has been signed off.
        """
        drawing = self.env["construction.drawing"].create({
            "name": "Roof Plan", "number": "AR-900",
            "project_id": self.project.id})
        rev_a = self._publish(drawing, "A")

        transmittal = self._transmittal(revisions=rev_a)
        transmittal.action_issue()
        self.assertEqual(transmittal.superseded_count, 0)

        # Publishing Rev. B supersedes Rev. A.
        self._publish(drawing, "B")
        transmittal.invalidate_recordset()
        self.assertEqual(transmittal.superseded_count, 1)

    def test_a_revision_knows_whether_it_ever_went_out(self):
        """A drawing marked current that was never issued is the quiet
        failure: the office is building to something the site has not seen."""
        self.assertFalse(self.rev_a.is_issued)
        transmittal = self._transmittal()
        self.rev_a.invalidate_recordset()
        self.assertFalse(self.rev_a.is_issued)   # drafted, not sent

        transmittal.action_issue()
        self.rev_a.invalidate_recordset()
        self.assertTrue(self.rev_a.is_issued)
        self.assertEqual(self.rev_a.transmittal_count, 1)

    def test_a_cancelled_transmittal_does_not_count_as_issued(self):
        transmittal = self._transmittal()
        transmittal.action_issue()
        transmittal.action_cancel()
        self.rev_a.invalidate_recordset()
        self.assertFalse(self.rev_a.is_issued)
