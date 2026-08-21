"""The rubric, checked against the shape of company this is actually sold to.

The assertion that matters most is the one about size: a large contractor
scoring below a small one looks like a bug until you remember the sales team
is one person. If somebody "fixes" that ranking, this test should stop them
and the docstring should explain why.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestIcpScoring(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = cls.env.ref("majal_sales_ops.source_own_research")
        cls.ae = cls.env.ref("base.ae")
        cls.eg = cls.env.ref("base.eg")
        cls.gb = cls.env.ref("base.uk")

    def _lead(self, **values):
        base = {
            "name": "Test lead",
            "majal_managed": True,
            "majal_source_id": self.source.id,
        }
        base.update(values)
        return self.env["crm.lead"].create(base)

    def test_the_ideal_lead_is_tier_a(self):
        lead = self._lead(
            country_id=self.ae.id, majal_segment="contractor",
            majal_size_band="small", majal_role_class="owner")
        self.assertEqual(lead.majal_icp_score, 100)
        self.assertEqual(lead.majal_icp_tier, "a")

    def test_outside_the_three_markets_scores_nothing_for_market(self):
        home = self._lead(
            country_id=self.ae.id, majal_segment="contractor",
            majal_size_band="small", majal_role_class="owner")
        away = self._lead(
            country_id=self.gb.id, majal_segment="contractor",
            majal_size_band="small", majal_role_class="owner")
        self.assertEqual(home.majal_icp_score - away.majal_icp_score, 30)

    def test_smb_outranks_enterprise_on_purpose(self):
        """Not a bug. A 500+ contractor has a procurement cycle measured in
        quarters and an incumbent system; a one-person sales operation should
        spend its mornings elsewhere."""
        small = self._lead(
            country_id=self.eg.id, majal_segment="contractor",
            majal_size_band="small", majal_role_class="owner")
        large = self._lead(
            country_id=self.eg.id, majal_segment="contractor",
            majal_size_band="large", majal_role_class="owner")
        self.assertGreater(small.majal_icp_score, large.majal_icp_score)

    def test_the_owner_outranks_the_it_manager(self):
        owner = self._lead(
            country_id=self.eg.id, majal_segment="contractor",
            majal_size_band="medium", majal_role_class="owner")
        it = self._lead(
            country_id=self.eg.id, majal_segment="contractor",
            majal_size_band="medium", majal_role_class="it")
        self.assertGreater(owner.majal_icp_score, it.majal_icp_score)

    def test_tiers_partition_the_range(self):
        lead = self._lead(country_id=self.eg.id, majal_segment="contractor",
                          majal_size_band="small", majal_role_class="owner")
        self.assertEqual(lead.majal_icp_tier, "a")
        lead.majal_role_class = "other"          # 30+25+25+3 = 83
        self.assertEqual(lead.majal_icp_tier, "a")
        lead.majal_size_band = "micro"           # 30+25+10+3 = 68
        self.assertEqual(lead.majal_icp_tier, "b")
        lead.majal_segment = "other"             # 30+0+10+3 = 43
        self.assertEqual(lead.majal_icp_tier, "c")
        lead.country_id = self.gb                # 0+0+10+3 = 13
        self.assertEqual(lead.majal_icp_tier, "d")

    def test_keys_are_derived_on_create(self):
        lead = self._lead(
            country_id=self.eg.id, email_from="ali@alnoor-eg.com",
            phone="0100 123 4567")
        self.assertEqual(lead.majal_phone_e164, "+201001234567")
        self.assertEqual(lead.majal_domain, "alnoor-eg.com")
        self.assertEqual(lead.majal_dedup_key, "domain:alnoor-eg.com")

    def test_duplicates_are_counted_not_merged(self):
        """Detection only — merging two live leads is a decision, not a job
        for an importer running at six in the morning."""
        first = self._lead(country_id=self.ae.id, email_from="a@sameco.ae")
        second = self._lead(country_id=self.ae.id, email_from="b@sameco.ae")
        self.assertEqual(first.majal_dedup_key, second.majal_dedup_key)
        self.assertEqual(first.majal_duplicate_count, 1)
