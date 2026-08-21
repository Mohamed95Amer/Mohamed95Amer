"""The follow-up loop, and the two ways it must refuse to misbehave.

Nothing here checks that a message is nicely worded. What it checks is that
the machine cannot send without a person, and cannot keep sending at somebody
who already answered — the two failures that would cost the domain and the
relationship rather than a reply.
"""

from odoo import fields
from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestSequence(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = cls.env.ref("majal_sales_ops.source_own_research")
        cls.sequence = cls.env.ref("majal_sales_ops.sequence_en")
        cls.lead = cls.env["crm.lead"].create({
            "name": "Gulf Contracting",
            "partner_name": "Gulf Contracting",
            "contact_name": "Sara",
            "email_from": "sara@gulfcontracting.ae",
            "country_id": cls.env.ref("base.ae").id,
            "majal_managed": True,
            "majal_source_id": cls.source.id,
            "majal_lang": "en",
            "majal_segment": "contractor",
            "majal_size_band": "small",
            "majal_role_class": "owner",
        })

    def test_starting_a_sequence_schedules_the_first_touch_today(self):
        self.lead.majal_start_sequence(self.sequence)
        self.assertEqual(self.lead.majal_sequence_state, "running")
        self.assertEqual(self.lead.majal_sequence_step, 0)
        self.assertEqual(self.lead.majal_next_action_date,
                         fields.Date.context_today(self.lead))

    def test_the_cron_drafts_rather_than_sends(self):
        """The whole design in one assertion."""
        self.lead.majal_start_sequence(self.sequence)
        self.env["majal.sales.sequence"]._cron_advance_sequences()
        outreach = self.env["majal.outreach"].search([
            ("lead_id", "=", self.lead.id)])
        self.assertEqual(len(outreach), 1)
        self.assertEqual(outreach.state, "pending")
        self.assertFalse(outreach.sent_date)

    def test_the_pointer_moves_by_the_gap_not_to_a_fixed_date(self):
        """A missed run must not fire four steps the next morning."""
        self.lead.majal_start_sequence(self.sequence)
        self.env["majal.sales.sequence"]._cron_advance_sequences()
        self.assertEqual(self.lead.majal_sequence_step, 1)
        # Steps one and two sit at day 0 and day 3, so the gap is three days
        # from today — not from whenever the sequence nominally began.
        self.assertEqual(
            self.lead.majal_next_action_date,
            fields.Date.add(fields.Date.context_today(self.lead), days=3))

    def test_an_unapproved_message_cannot_be_sent(self):
        self.lead.majal_start_sequence(self.sequence)
        self.env["majal.sales.sequence"]._cron_advance_sequences()
        outreach = self.env["majal.outreach"].search([
            ("lead_id", "=", self.lead.id)])
        sent = self.env["majal.outreach"]._cron_dispatch_approved()
        self.assertEqual(sent, 0)
        self.assertEqual(outreach.state, "pending")

    def test_state_cannot_be_written_directly(self):
        """The approvable mixin closes this door; make sure we did not reopen it."""
        self.lead.majal_start_sequence(self.sequence)
        self.env["majal.sales.sequence"]._cron_advance_sequences()
        outreach = self.env["majal.outreach"].search([
            ("lead_id", "=", self.lead.id)])
        user = self.env["res.users"].create({
            "name": "Sales Agent", "login": "majal.agent",
            "groups_id": [(6, 0, [
                self.env.ref("majal_sales_ops.group_majal_sales_agent").id,
                self.env.ref("base.group_user").id,
            ])],
        })
        with self.assertRaises(AccessError):
            outreach.with_user(user).write({"state": "approved"})

    def test_a_reply_stands_the_sequence_down(self):
        """Step four reaching somebody who answered step three is the single
        most damaging thing an outreach system does."""
        self.lead.majal_start_sequence(self.sequence)
        self.lead._majal_register_reply()
        self.assertEqual(self.lead.majal_sequence_state, "replied")
        self.assertFalse(self.lead.majal_next_action_date)
        drafted = self.env["majal.sales.sequence"]._cron_advance_sequences()
        self.assertEqual(drafted, 0)

    def test_the_sequence_finishes_instead_of_looping(self):
        self.lead.majal_start_sequence(self.sequence)
        steps = len(self.sequence.step_ids)
        for _ in range(steps + 2):
            self.lead.majal_next_action_date = fields.Date.context_today(self.lead)
            self.env["majal.sales.sequence"]._cron_advance_sequences()
        self.assertEqual(self.lead.majal_sequence_state, "done")
        self.assertEqual(
            self.env["majal.outreach"].search_count(
                [("lead_id", "=", self.lead.id)]), steps)

    def test_the_daily_cap_is_respected(self):
        cap = self.env["majal.outreach"]._daily_cap()
        self.assertGreater(cap, 0)
        self.assertLessEqual(cap, 50, "A cap this high stops protecting anything.")

    def test_tiktok_posts_are_never_counted_as_published_automatically(self):
        post = self.env["majal.content.post"].create({
            "name": "Site walkthrough clip",
            "platform": "tiktok",
            "body": "How a variation reaches a payment application.",
            "media_path": "/media/clip.mp4",
        })
        self.assertTrue(post.requires_manual_publish)
        self.assertNotIn(
            post.id,
            [row["id"] for row in
             self.env["majal.content.post"].publishing_queue()],
            "An unaudited TikTok post would be published SELF_ONLY — invisible.")
