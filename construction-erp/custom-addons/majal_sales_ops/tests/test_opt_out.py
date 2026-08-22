"""The one request this pipeline is never allowed to get wrong.

Everything else here is a matter of degree — a badly scored lead wastes a
morning, a clumsy subject line wastes a prospect. Continuing to email somebody
who asked you to stop is a different category: it is the failure that ends the
sending domain, and in the UAE, Saudi and Egypt it is the one with a regulator
attached.

So the tests below are less about the happy path than about the ways an opt-out
could quietly fail to stick: a message already approved and waiting in tonight's
queue, the "send now" button that skips the queue entirely, a well-meaning bulk
resume, and the next import of the same list putting them straight back in.
"""

from odoo import fields
from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestOptOut(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # _send refuses outright without a configured sender, which would mask
        # the thing test_send_now_refuses_too is actually asserting.
        cls.env["ir.config_parameter"].sudo().set_param(
            "majal_sales_ops.sending_identity",
            "Mohamed Amer <support@majalops.com>")
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

    def _draft(self, state="approved"):
        outreach = self.env["majal.outreach"].create({
            "lead_id": self.lead.id,
            "channel": "email",
            "subject": "A question about your commercial reporting",
            "body_html": "<p>Hello</p>",
            "email_to": self.lead.email_from,
            "scheduled_date": fields.Date.context_today(self.lead),
        })
        outreach._majal_set_state(state)
        return outreach

    # ------------------------------------------------------------------
    # The request takes effect immediately, including on what is queued
    # ------------------------------------------------------------------
    def test_opting_out_withdraws_a_message_already_approved(self):
        """The flag alone would not have stopped tonight's cron."""
        outreach = self._draft("approved")
        self.lead.majal_opt_out()
        self.assertEqual(outreach.state, "rejected")
        self.assertTrue(self.lead.majal_opted_out)
        self.assertEqual(self.lead.majal_sequence_state, "opted_out")
        self.assertFalse(self.lead.majal_next_action_date)

    def test_the_dispatch_cron_skips_an_opted_out_lead(self):
        outreach = self._draft("approved")
        # Opt out without going through majal_opt_out, so the only thing
        # standing between this lead and a send is the cron's own domain.
        self.lead.sudo().write({"majal_opted_out": True})
        sent = self.env["majal.outreach"]._cron_dispatch_approved()
        self.assertEqual(sent, 0)
        self.assertEqual(outreach.state, "approved")
        self.assertFalse(outreach.sent_date)

    def test_send_now_refuses_too(self):
        """The button that deliberately steps over the cap must not step
        over this."""
        outreach = self._draft("approved")
        self.lead.sudo().write({"majal_opted_out": True})
        outreach._send()
        self.assertEqual(outreach.state, "rejected")
        self.assertFalse(outreach.sent_date)

    def test_the_drafting_cron_writes_nothing_further(self):
        self.lead.majal_start_sequence(self.sequence)
        self.lead.majal_opt_out()
        before = self.env["majal.outreach"].search_count(
            [("lead_id", "=", self.lead.id)])
        self.env["majal.sales.sequence"]._cron_advance_sequences()
        after = self.env["majal.outreach"].search_count(
            [("lead_id", "=", self.lead.id)])
        self.assertEqual(before, after)

    # ------------------------------------------------------------------
    # And it survives the things that would otherwise undo it
    # ------------------------------------------------------------------
    def test_resuming_an_opted_out_lead_raises(self):
        self.lead.majal_opt_out()
        with self.assertRaises(ValidationError):
            self.lead.action_majal_resume_sequence()

    def test_starting_a_sequence_silently_skips_them(self):
        """A bulk "start sequence" over a selection must not catch them.

        Raising here would be wrong — it would make one opted-out row block a
        legitimate action on two hundred others, and the person would work
        around it. Skipping is what keeps the control from being resented.
        """
        other = self.lead.copy({
            "email_from": "omar@gulfcontracting.ae",
            "contact_name": "Omar",
        })
        self.lead.majal_opt_out()
        (self.lead | other).majal_start_sequence(self.sequence)
        self.assertEqual(self.lead.majal_sequence_state, "opted_out")
        self.assertEqual(other.majal_sequence_state, "running")

    def test_the_flag_does_not_copy_onto_a_duplicate(self):
        """copy=False on the opt-out fields, asserted rather than assumed.

        A duplicated record inheriting somebody else's opt-out would look
        harmless and quietly remove a real lead from the pipeline forever.
        """
        self.lead.majal_opt_out()
        fresh = self.lead.copy({"email_from": "new@elsewhere.ae"})
        self.assertFalse(fresh.majal_opted_out)
        self.assertFalse(fresh.majal_opt_out_date)
        self.assertEqual(fresh.majal_sequence_state, "running")

    # ------------------------------------------------------------------
    # What actually goes out
    # ------------------------------------------------------------------
    def test_every_message_carries_an_unsubscribe_link(self):
        outreach = self._draft("approved")
        footer = outreach._compliance_footer()
        self.assertIn(outreach.access_token, footer)
        self.assertIn("/majal/unsubscribe/", footer)

    def test_the_footer_follows_the_lead_s_language(self):
        outreach = self._draft("approved")
        self.assertIn("Unsubscribe", outreach._compliance_footer())
        self.lead.majal_lang = "ar"
        arabic = outreach._compliance_footer()
        self.assertIn('dir="rtl"', arabic)
        self.assertIn("إلغاء الاشتراك", arabic)

    def test_the_unsubscribe_link_is_not_click_tracked(self):
        """Tracking it would score the person as interested at the exact
        moment they asked to be left alone."""
        outreach = self._draft("approved")
        outreach.body_html = '<p><a href="https://majalops.com/features">x</a></p>'
        body = outreach._tracked_body() + outreach._compliance_footer()
        self.assertIn("/majal/c/", body)          # the real link is tracked
        self.assertIn("/majal/unsubscribe/", body)
        self.assertEqual(len(outreach.link_ids), 1)
        self.assertNotIn("unsubscribe", outreach.link_ids.url)

    def test_one_click_headers_are_well_formed(self):
        """Odoo parses this field with ast.literal_eval, so a repr that does
        not round-trip silently drops every header."""
        import ast
        outreach = self._draft("approved")
        headers = ast.literal_eval(
            outreach._mail_headers("support@majalops.com"))
        self.assertEqual(headers["List-Unsubscribe-Post"],
                         "List-Unsubscribe=One-Click")
        self.assertIn(outreach._unsubscribe_url(),
                      headers["List-Unsubscribe"])
