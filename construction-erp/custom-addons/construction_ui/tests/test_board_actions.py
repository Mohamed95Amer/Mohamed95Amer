"""A board action has to name the board it means.

board.board is a shared shell: every dashboard in the product is a form view
on that one model. An act_window that sets res_model="board.board" and no
view_id therefore does not get "the empty personal dashboard" -- it gets
whichever form view on board.board wins resolution, and with nine of them
installed that was the Equipment board.

The effect was that "My Workspace" handed every user the estate portfolio.
A site engineer cannot read majal.estate.report, so the screen they were
sent to by their own menu refused them. Nothing in the XML looks wrong; the
action simply omits a field, and the omission only becomes visible once a
second board view exists in the database.

Guarded rather than commented, because the next dashboard someone adds is
what re-triggers it.
"""

from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestBoardActions(TransactionCase):
    def test_every_board_action_names_its_view(self):
        actions = self.env["ir.actions.act_window"].search(
            [("res_model", "=", "board.board")])
        self.assertTrue(actions, "no board actions found -- test is inert")
        unpinned = [
            f"{a.id} {a.name}" for a in actions if not a.view_id
        ]
        self.assertFalse(unpinned, (
            "These board.board actions name no view_id. Odoo will resolve the "
            "model's form view for them, and with several dashboards "
            "installed that is whichever one happens to win -- not the empty "
            "personal dashboard they are meant to open:\n"
            + "\n".join(unpinned)))

    def test_my_workspace_opens_the_personal_dashboard(self):
        personal = self.env.ref("board.board_my_dash_view")
        for xmlid in ("construction_ui.action_construction_my_dashboard",
                      "construction_ui.action_facility_my_dashboard"):
            action = self.env.ref(xmlid)
            self.assertEqual(
                action.view_id, personal,
                f"{xmlid} does not open the personal dashboard, so it shows "
                f"somebody else's board instead")
