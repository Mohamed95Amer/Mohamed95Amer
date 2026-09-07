"""Which rule governs a document, and whether one governs it at all.

Three faults sat in `_match` and `_covers`, and they share a shape: each
turns a question about the document into a question about something else --
who is reading it, or which currency happens to be lying around.

The dangerous one is the search. It ran under the reader's own rights, and
`construction.approval.rule` is company-scoped, so a user outside the company
that owns the rules got an empty set. The caller cannot tell that apart from
"no rule covers this document", and reads it as consent: the document goes
through unapproved, with nothing logged, because as far as the engine knew
there was nothing to log. That is the opposite of what an approval engine is
for, and it is silent, which is worse.

The other two are quieter. A band written 0-50,000 in one currency governed a
50,000 document in another as though the digits were the authority. And the
sort had no company term at all, so a company's own rule and an inherited
company-less default tied on every term and the winner was whatever the
_order clause surfaced.

The band tests drive `_covers` directly rather than through a document. The
conversion is the whole subject, and building a document whose currency can
be set means building a BOQ to hang it off -- setup that would obscure what
is being asserted without testing any more of it.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestApprovalRuleMatching(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ours = cls.env["res.company"].create({"name": "Rule Co"})
        cls.theirs = cls.env["res.company"].create({"name": "Other Co"})
        cls.env["res.users"]._majal_install_tenant_rules()

        cls.model = cls.env["ir.model"]._get("construction.rfi")
        cls.manager_group = cls.env.ref(
            "construction_base.group_construction_manager")
        cls.stranger = new_test_user(
            cls.env, login="rule.stranger", password="rule-stranger-pw-2026",
            groups="construction_base.group_construction_manager",
            company_id=cls.theirs.id, company_ids=[(6, 0, [cls.theirs.id])])

        cls.project = cls.env["project.project"].create({
            "name": "Rule Tower", "is_construction": True,
            "company_id": cls.ours.id,
        })
        cls.document = cls.env["construction.rfi"].create({
            "name": "Which rule governs this?",
            "project_id": cls.project.id,
            "question": "<p>Which rule governs this?</p>",
        })

    def _rule(self, name, company, **extra):
        values = {
            "name": name,
            "model_id": self.model.id,
            "company_id": company.id if company else False,
            "amount_from": 0.0,
            "step_ids": [(0, 0, {
                "name": "Sign", "group_id": self.manager_group.id,
            })],
        }
        values.update(extra)
        return self.env["construction.approval.rule"].create(values)

    def _match_as(self, user):
        self.env.invalidate_all()
        return self.env["construction.approval.rule"].with_user(user)._match(
            self.document, 0.0)

    # -------------------------------------------------------------- search

    def test_a_rule_is_found_by_a_reader_who_cannot_see_it(self):
        """The fault that let documents through unapproved.

        The rule belongs to our company; the reader belongs to another. Under
        the reader's own rights the search returned nothing, and nothing is
        what the caller reads as "this needs no approval".
        """
        rule = self._rule("Ours", self.ours)
        self.assertEqual(self._match_as(self.stranger), rule)

    def test_the_rule_follows_the_document_not_the_reader(self):
        """A rule of the reader's own company must not govern our document.

        The guard on the fix. Elevating the search removes the reader from
        the question; it must not also remove the company boundary, which
        would hand a subsidiary's variation to the parent's thresholds.
        """
        self._rule("Theirs", self.theirs)
        self.assertFalse(
            self._match_as(self.stranger),
            "A rule belonging to the reader's company governed a document "
            "belonging to another.")

    def test_no_rule_still_means_no_rule(self):
        """"Nothing configured, nothing required" is the documented default
        and has to survive the fix -- an elevated search must not invent a
        match any more than a scoped one should hide a real one."""
        self.assertFalse(self._match_as(self.env.user))

    # ------------------------------------------------------------ ordering

    def test_a_company_rule_beats_a_company_less_default(self):
        self._rule("Default", False)
        mine = self._rule("Ours", self.ours)
        self.assertEqual(
            self._match_as(self.env.user), mine,
            "A company-less default outranked the company's own rule. With "
            "no company term in the sort the two tie on every term and the "
            "winner is whichever the _order clause happened to surface.")

    def test_a_project_rule_still_beats_a_company_rule(self):
        """The new term must rank below the existing ones, not above them."""
        self._rule("Ours", self.ours)
        specific = self._rule("This job", False, project_id=self.project.id)
        self.assertEqual(self._match_as(self.env.user), specific)

    # ------------------------------------------------------------ currency

    def _weak_currency(self):
        """A currency worth half of ours, so 50,000 of it is 25,000 to us."""
        weak = self.env["res.currency"].create({
            "name": "WK9", "symbol": "W", "rounding": 0.01,
        })
        self.env["res.currency.rate"].create({
            "name": "2026-01-01", "currency_id": weak.id,
            "company_id": self.ours.id, "rate": 2.0,
        })
        return weak

    def test_a_band_is_money_rather_than_a_number(self):
        strong = self.ours.currency_id
        weak = self._weak_currency()
        lower = self._rule("Up to 50k", self.ours, amount_to=50000.0,
                           currency_id=strong.id)

        self.assertTrue(
            lower._covers(50000.0, weak),
            "50,000 in a currency at half the rate is 25,000 to a rule "
            "written in the stronger one, and belongs in its lower band.")
        self.assertFalse(
            lower._covers(50000.0, strong),
            "In the rule's own currency 50,000 is the exclusive upper bound "
            "of the lower band. Conversion must not move that boundary.")

    def test_one_currency_everywhere_behaves_as_before(self):
        """The common case must not acquire a conversion it does not need."""
        rule = self._rule("Up to 50k", self.ours, amount_to=50000.0,
                          currency_id=self.ours.currency_id.id)
        self.assertTrue(rule._covers(49999.0, self.ours.currency_id))
        self.assertFalse(rule._covers(50000.0, self.ours.currency_id))
        self.assertTrue(rule._covers(49999.0))
