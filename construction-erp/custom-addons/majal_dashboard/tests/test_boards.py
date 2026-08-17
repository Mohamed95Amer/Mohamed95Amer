"""The boards have to survive being opened.

A board is the one screen where a single bad panel is not a local failure.
Panels render inside one OWL tree, so a component that raises in its lifecycle
takes the whole dashboard down with a client error dialog — the user does not
lose a chart, they lose the page.

That is not hypothetical here. The Trading Summary panel was added with a
window action carrying no context, and MisReportWidget._instanceId() falls
back to context.active_model / active_id precisely because — in mis_builder's
own words — "in a dashboard the view does not seem to be bound to an
instance". With no context the widget called read() on an empty id list and
the Financial board died on open. Every Python test passed through it, because
nothing in the suite opens a board.

So these tests assert the things that would have caught it: that each board's
arch names actions that exist, and that the MIS panel carries the three keys
the widget and get_views() need. They are not a substitute for driving a
browser — they cannot see a rendering fault — but they pin the contract that
was actually broken.
"""

import ast

from lxml import etree

from odoo.tests import TransactionCase, tagged, new_test_user

BOARDS = [
    "board_executive", "board_financial", "board_operations", "board_project",
    "board_procurement", "board_workforce", "board_hse", "board_equipment",
]


@tagged("post_install", "-at_install")
class TestBoards(TransactionCase):
    def _panel_action_ids(self, view):
        root = etree.fromstring(view.arch)
        return [int(node.get("name")) for node in root.iter("action")
                if (node.get("name") or "").isdigit()]

    def test_every_board_panel_points_at_an_action_that_exists(self):
        """A board silently drops a panel whose action id has gone; the board
        then looks merely sparse rather than broken."""
        for xmlid in BOARDS:
            view = self.env.ref(f"majal_dashboard.{xmlid}")
            ids = self._panel_action_ids(view)
            self.assertTrue(ids, f"{xmlid} has no panels at all")
            found = self.env["ir.actions.act_window"].browse(ids).exists()
            self.assertEqual(
                len(found), len(ids),
                f"{xmlid} references act_window ids that no longer exist")

    def test_the_mis_panel_carries_what_the_widget_needs(self):
        """Without these three keys the Financial board raises on open.

        The context has to be on the *panel*, not only on the action. The
        widget reads props.record.context, which a board fills from the
        <action> element's own context attribute; an act_window's context does
        not reach it. That distinction is the whole bug — setting it on the
        action alone left the board crashing exactly as before.

        active_model and active_id are how MisReportWidget finds its instance
        when a board gives it no bound record; from_dashboard is how
        mis.report.instance.get_views() knows to substitute the computed
        matrix for the configuration form.
        """
        view = self.env.ref("majal_dashboard.board_financial")
        action = self.env.ref("majal_dashboard.action_mis_trading_board")
        instance = self.env.ref("majal_dashboard.mis_instance_trading")

        root = etree.fromstring(view.arch)
        panels = [n for n in root.iter("action")
                  if n.get("name") == str(action.id)]
        self.assertEqual(len(panels), 1, "the MIS panel is not on the board")

        context = ast.literal_eval(panels[0].get("context") or "{}")
        self.assertTrue(context.get("from_dashboard"))
        self.assertEqual(context.get("active_model"), "mis.report.instance")
        self.assertEqual(context.get("active_id"), instance.id,
                         "active_id must resolve to the shipped instance")
        self.assertEqual(action.res_id, instance.id)

    def test_the_mis_panel_is_actually_on_the_financial_board(self):
        view = self.env.ref("majal_dashboard.board_financial")
        action = self.env.ref("majal_dashboard.action_mis_trading_board")
        self.assertIn(action.id, self._panel_action_ids(view))


@tagged("post_install", "-at_install")
class TestShippedMisInstanceIsGlobal(TransactionCase):
    """The Financial board has to open for somebody other than the superuser.

    mis_builder scopes instances by company, and the instance this module
    ships was created with company_id defaulting to the install company. In
    any database with more than one company that hides it from everybody
    else -- the board refused the Platform Owner, the company administrator
    and the operations manager, and only the superuser was ever exempt.
    """

    def test_the_shipped_instance_belongs_to_no_single_company(self):
        instance = self.env.ref("majal_dashboard.mis_instance_trading")
        self.assertFalse(
            instance.company_id,
            "the shipped MIS instance is pinned to one company, so the "
            "Financial board is unopenable from every other one")

    def test_a_plain_user_in_another_company_can_read_it(self):
        other = self.env["res.company"].create({"name": "Board Reader Co"})
        reader = new_test_user(
            self.env, login="board.reader", password="board-reader-pw-2026",
            groups="base.group_user",
            company_id=other.id, company_ids=[(6, 0, [other.id])])
        self.env.invalidate_all()
        instance = self.env.ref("majal_dashboard.mis_instance_trading")
        self.assertTrue(
            instance.with_user(reader).exists()
            and instance.with_user(reader).name,
            "a user outside the install company still cannot read the "
            "instance the Financial board is built on")
