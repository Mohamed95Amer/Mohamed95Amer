"""Interest, which is a different question from fit.

The assertions worth reading are the two about ordering. A pipeline sorted by
fit alone spends its mornings on contractors who have never heard of Majal
while somebody who asked for a demo yesterday sits further down the list, and
that is the failure this whole layer exists to prevent.
"""

from datetime import timedelta

from odoo import fields
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestInterest(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = cls.env.ref("majal_sales_ops.source_own_research")
        cls.events = cls.env["majal.interest.event"]

    def _lead(self, name="Lead", **values):
        base = {
            "name": name,
            "majal_managed": True,
            "majal_source_id": self.source.id,
            "country_id": self.env.ref("base.ae").id,
            "majal_segment": "contractor",
        }
        base.update(values)
        return self.env["crm.lead"].create(base)

    # ------------------------------------------------------------------
    def test_a_lead_with_no_signal_is_cold(self):
        lead = self._lead()
        self.assertEqual(lead.majal_interest_score, 0)
        self.assertEqual(lead.majal_engagement, "cold")

    def test_a_demo_request_is_the_strongest_signal(self):
        asked = self._lead("Asked")
        clicked = self._lead("Clicked")
        self.events.record(asked, "demo_request")
        self.events.record(clicked, "email_click")
        self.assertGreater(asked.majal_interest_score,
                           clicked.majal_interest_score)
        self.assertEqual(asked.majal_engagement, "warm")

    def test_interest_decays_with_age(self):
        """A click three weeks old is worth about half a click today."""
        stale = self._lead("Stale")
        fresh = self._lead("Fresh")
        event = self.events.record(stale, "demo_request")
        event.occurred_at = fields.Datetime.now() - timedelta(days=21)
        stale._compute_majal_interest()
        self.events.record(fresh, "demo_request")
        self.assertLess(stale.majal_interest_score,
                        fresh.majal_interest_score)
        # Half-life is 21 days, so the old one should be near half, not near zero.
        self.assertAlmostEqual(
            stale.majal_interest_score, fresh.majal_interest_score / 2,
            delta=3)

    def test_intent_outranks_fit_in_the_working_queue(self):
        """The point of the whole layer, in one assertion.

        A poor-fit contractor who asked for a demo must sort above a perfect-fit
        one who has never heard of us.
        """
        perfect_but_cold = self._lead(
            "Perfect fit", majal_size_band="small", majal_role_class="owner")
        poor_but_asking = self._lead(
            "Poor fit", majal_segment="other", majal_size_band="large",
            majal_role_class="it")
        self.events.record(poor_but_asking, "demo_request")

        self.assertGreater(perfect_but_cold.majal_icp_score,
                           poor_but_asking.majal_icp_score)
        ordered = self.env["crm.lead"].search(
            [("id", "in", (perfect_but_cold | poor_but_asking).ids)],
            order="majal_interest_score desc, majal_icp_score desc")
        self.assertEqual(ordered[0], poor_but_asking)

    def test_the_score_is_capped(self):
        lead = self._lead()
        for _ in range(10):
            self.events.record(lead, "demo_request")
        self.assertEqual(lead.majal_interest_score, 100)

    def test_a_reply_is_both_a_stop_and_a_signal(self):
        lead = self._lead()
        lead.majal_sequence_state = "running"
        lead._majal_register_reply()
        self.assertEqual(lead.majal_sequence_state, "replied")
        self.assertEqual(lead.majal_engagement, "engaged")
        self.assertTrue(lead.majal_interest_ids.filtered(
            lambda e: e.kind == "reply"))

    # ------------------------------------------------------------------
    def test_a_click_is_counted_against_the_link_that_was_clicked(self):
        lead = self._lead(email_from="sara@gulfco.ae")
        outreach = self.env["majal.outreach"].create({
            "lead_id": lead.id, "channel": "email",
            "subject": "Hello", "body_html": "<p>hi</p>",
        })
        link = self.env["majal.outreach.link"].create({
            "outreach_id": outreach.id, "index": 0,
            "url": "https://majalops.com/features.html",
        })
        destination = link._register_click()
        self.assertEqual(destination, "https://majalops.com/features.html")
        self.assertEqual(link.click_count, 1)
        self.assertEqual(lead.majal_interest_ids[0].kind, "email_click")

    def test_link_rewriting_never_puts_a_destination_in_the_url(self):
        """An open redirect on the outreach domain is not worth simpler code."""
        lead = self._lead(email_from="a@b.ae")
        outreach = self.env["majal.outreach"].create({
            "lead_id": lead.id, "channel": "email", "subject": "s",
            "body_html": '<p><a href="https://majalops.com/features.html">x</a>'
                         '<a href="mailto:me@majalops.com">mail</a></p>',
        })
        self.env["ir.config_parameter"].sudo().set_param(
            "web.base.url", "https://erp.majalops.com")
        body = outreach._tracked_body()
        self.assertIn("/majal/c/%s/0" % outreach.access_token, body)
        self.assertNotIn("features.html\"", body.split("mailto")[0])
        # A mailto is left exactly as it was.
        self.assertIn('href="mailto:me@majalops.com"', body)
        self.assertEqual(outreach.link_ids.url,
                         "https://majalops.com/features.html")

    def test_tokens_are_random_and_unique(self):
        """A click URL must not be guessable from a neighbouring one.

        An earlier version of this asserted that the record id did not appear
        as a substring of the token, which is not a test of anything: a
        one-digit id occurs in eight random hex characters about half the time,
        so it failed on a fair coin rather than on a defect. The properties
        that actually matter are that tokens are unique and drawn from a large
        random space.
        """
        lead = self._lead()
        tokens = [
            self.env["majal.outreach"].create(
                {"lead_id": lead.id, "channel": "email"}).access_token
            for _ in range(25)
        ]
        self.assertEqual(len(set(tokens)), 25, "tokens collided")
        for token in tokens:
            self.assertRegex(token, r"^[0-9a-f]{32}$")
