"""The Approval Studio card must not wrap fields in <header>.

Odoo 18's kanban compiler treats `<header>` inside `t-name="card"` as a
reserved element and does not register the `<field>` nodes inside it. The
compiled card then asks `archInfo.fieldNodes` for an id that is not there:

    TypeError: Cannot destructure property 'name' of
               'archInfo.fieldNodes[fieldId]' as it is undefined
        at KanbanRecord.getFormattedValue

The user meets that as Odoo's generic client error dialog with an empty
Approval Studio behind it. The whole screen, for everyone.

Nothing server-side is wrong, which is why this survived: the view renders,
`get_view` succeeds, the twelve rules read cleanly, and the suite is green.
It fails only in the browser, and only when a card is actually drawn.

Three plausible explanations were tried and were all wrong -- duplicate root
and template field declarations, the legacy `record.amount_to.raw_value`
expression, and a missing `currency_id` node. Bisecting the card one element
at a time against a live server is what found it: every field renders alone,
and the `<header>` wrapper fails on its own.

This test is static because the suite has no browser. It cannot see the
crash; it can see the shape that causes it, which is enough to stop the
regression.
"""

from lxml import etree

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestApprovalStudioCardRenders(TransactionCase):
    def _card(self, xmlid):
        view = self.env.ref(xmlid)
        root = etree.fromstring(view.arch.encode())
        cards = root.xpath('//t[@t-name="card"]')
        self.assertTrue(cards, f"{xmlid} has no t-name='card' template")
        return cards[0]

    def test_no_header_element_wraps_fields_in_the_card(self):
        card = self._card("majal_approval_studio.view_approval_rule_kanban")
        headers = card.xpath(".//header")
        self.assertFalse(
            headers,
            "A <header> inside the kanban card swallows the <field> nodes "
            "within it, and the card then crashes the whole view with "
            "'Cannot destructure property name of archInfo.fieldNodes'. "
            "Use a div with a class instead.")

    def test_the_card_still_shows_what_it_is_for(self):
        """Guard against 'fixing' the crash by emptying the card.

        Removing the header is one keystroke away from removing the fields
        it contained, and an Approval Studio whose cards show nothing but a
        name is not obviously broken to anybody reading a screenshot.
        """
        card = self._card("majal_approval_studio.view_approval_rule_kanban")
        names = set(card.xpath(".//field/@name"))
        for field in ("name", "active", "scope_label", "step_count",
                      "amount_from"):
            self.assertIn(
                field, names,
                f"the card no longer shows {field}; a rule card without its "
                f"scope, its step count and its value band is not a rule card")

    def test_every_field_the_card_draws_exists_on_the_model(self):
        """A field that is not on the model fails the same way client-side."""
        card = self._card("majal_approval_studio.view_approval_rule_kanban")
        model_fields = set(self.env["construction.approval.rule"]._fields)
        for name in set(card.xpath(".//field/@name")):
            self.assertIn(
                name, model_fields,
                f"the card draws {name!r}, which construction.approval.rule "
                f"does not have")
