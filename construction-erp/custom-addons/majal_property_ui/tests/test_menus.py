"""The chrome that makes Property look like part of the platform.

None of this is business logic, which is exactly why it needs a test: a
broken client-action reference or a menu pointing at the wrong kind of
action is invisible until somebody clicks it.
"""

from odoo.tests import TransactionCase, tagged

# Keys declared in property_workspaces.js. Kept here rather than parsed from
# the JS so that deleting a client action without deleting its config, or the
# reverse, is caught rather than silently halving the hub.
PROPERTY_WORKSPACE_KEYS = [
    "property_portfolio", "unit_inventory", "reservations", "leads",
    "installments", "commissions", "handovers", "leases", "rent_collection",
    "unit_requests",
]


@tagged("post_install", "-at_install")
class TestPropertyMenus(TransactionCase):
    def test_every_workspace_key_has_a_client_action(self):
        for key in PROPERTY_WORKSPACE_KEYS:
            action = self.env.ref(f"majal_property_ui.action_workspace_{key}")
            self.assertEqual(action._name, "ir.actions.client")
            self.assertEqual(action.tag, f"majal_suite_ui.workspace.{key}")

    def test_the_workspace_tag_prefix_is_the_shells_own(self):
        """The hub component derives its config key by stripping exactly this
        prefix, so a private namespace would resolve to an unknown workspace.
        The prefix belongs to majal_suite_ui because the component does."""
        for key in PROPERTY_WORKSPACE_KEYS:
            tag = self.env.ref(f"majal_property_ui.action_workspace_{key}").tag
            self.assertTrue(tag.startswith("majal_suite_ui.workspace."))

    def test_the_root_menu_opens_the_property_home(self):
        root = self.env.ref("majal_real_estate.menu_majal_real_estate_root")
        home = self.env.ref("majal_property_ui.action_property_home")
        self.assertEqual(root.action.id, home.id)
        self.assertEqual(home.tag, "majal_property_ui.property_home")

    def test_the_root_menu_sequence_does_not_collide(self):
        root = self.env.ref("majal_real_estate.menu_majal_real_estate_root")
        self.assertEqual(root.sequence, 38)
        clashes = self.env["ir.ui.menu"].search([
            ("parent_id", "=", False),
            ("sequence", "=", root.sequence),
            ("id", "!=", root.id),
        ])
        self.assertFalse(clashes, f"sequence {root.sequence} also used by {clashes.mapped('name')}")

    def test_section_menus_open_workspaces_and_leaves_open_registers(self):
        sections = {
            "menu_property_portfolio": "action_workspace_property_portfolio",
            "majal_real_estate.menu_majal_real_estate_inventory": "action_workspace_unit_inventory",
            "majal_real_estate.menu_majal_real_estate_sales": "action_workspace_reservations",
            "majal_real_estate.menu_majal_real_estate_handover": "action_workspace_handovers",
            "majal_property_operations.menu_majal_property_operations": "action_workspace_leases",
        }
        for menu_xmlid, action_name in sections.items():
            ref = menu_xmlid if "." in menu_xmlid else f"majal_property_ui.{menu_xmlid}"
            menu = self.env.ref(ref)
            self.assertEqual(
                menu.action.id,
                self.env.ref(f"majal_property_ui.{action_name}").id,
                f"{menu.name} should open its workspace",
            )

        for leaf_xmlid in (
            "majal_real_estate.menu_majal_real_estate_units",
            "majal_real_estate.menu_majal_real_estate_reservations",
            "majal_real_estate.menu_majal_real_estate_handovers",
            "majal_property_operations.menu_majal_leases",
        ):
            menu = self.env.ref(leaf_xmlid)
            self.assertEqual(
                menu.action._name, "ir.actions.act_window",
                f"{menu.name} is a register and should open its own list",
            )

    def test_every_section_has_an_overview_child_first(self):
        for section_xmlid in (
            "majal_property_ui.menu_property_portfolio",
            "majal_real_estate.menu_majal_real_estate_inventory",
            "majal_real_estate.menu_majal_real_estate_sales",
            "majal_real_estate.menu_majal_real_estate_handover",
            "majal_property_operations.menu_majal_property_operations",
        ):
            section = self.env.ref(section_xmlid)
            first = section.child_id.sorted(lambda m: (m.sequence, m.id))[:1]
            self.assertTrue(first, f"{section.name} has no children")
            self.assertEqual(
                first.sequence, 1,
                f"{section.name} should lead with its Overview at sequence 1")
            self.assertEqual(first.action._name, "ir.actions.client")

    def test_the_portfolio_section_gathers_the_physical_estate(self):
        portfolio = self.env.ref("majal_property_ui.menu_property_portfolio")
        names = portfolio.child_id.mapped("name")
        for expected in ("Developments", "Communities", "Buildings", "Floors"):
            self.assertIn(expected, names)

    def test_the_configuration_menu_is_called_settings(self):
        config = self.env.ref("majal_real_estate.menu_majal_real_estate_config")
        self.assertEqual(config.name, "Settings")
