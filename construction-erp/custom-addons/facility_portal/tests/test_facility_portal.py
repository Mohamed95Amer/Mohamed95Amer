from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestFacilityPortal(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        portal_group = cls.env.ref("base.group_portal")
        cls.tenant_a = cls.env["res.partner"].create({"name": "Tenant A"})
        cls.tenant_b = cls.env["res.partner"].create({"name": "Tenant B"})
        cls.user_a = cls.env["res.users"].create({
            "name": "Tenant A user", "login": "tenant_a_portal",
            "partner_id": cls.tenant_a.id,
            "groups_id": [(6, 0, [portal_group.id])],
        })
        cls.req_a = cls.env["maintenance.request"].create({
            "name": "AC not cooling", "portal_reporter_id": cls.tenant_a.id,
        })
        cls.req_b = cls.env["maintenance.request"].create({
            "name": "Lift noisy", "portal_reporter_id": cls.tenant_b.id,
        })

    def test_occupant_sees_only_their_own_requests(self):
        visible = self.env["maintenance.request"].with_user(self.user_a).search([])
        self.assertIn(self.req_a, visible)
        self.assertNotIn(self.req_b, visible)

    def test_occupant_cannot_read_another_tenants_request(self):
        with self.assertRaises(AccessError):
            self.req_b.with_user(self.user_a).check_access("read")

    def test_occupant_cannot_edit_a_request(self):
        """Following a request is not the same as being able to change it —
        an occupant must not be able to close their own fault."""
        with self.assertRaises(AccessError):
            self.req_a.with_user(self.user_a).write({"name": "hacked"})

    def test_access_url_points_at_the_portal(self):
        self.assertEqual(
            self.req_a.access_url, f"/my/facility/request/{self.req_a.id}")

    def test_request_without_a_reporter_is_invisible_to_portal(self):
        """Internally raised work is not an occupant's business."""
        internal = self.env["maintenance.request"].create({"name": "Planned PM"})
        visible = self.env["maintenance.request"].with_user(self.user_a).search([])
        self.assertNotIn(internal, visible)

    # ------------------------------------------------------------------
    # Information the portal must not hand out
    # ------------------------------------------------------------------
    def test_only_published_equipment_is_offered(self):
        """The fault form used to enumerate every asset in the database.

        An occupant of one building could read the names of every chiller,
        pump and panel the company maintains, including other clients'.
        """
        hidden = self.env["maintenance.equipment"].create(
            {"name": "Other client's chiller"})
        published = self.env["maintenance.equipment"].create(
            {"name": "Lobby air handling unit", "portal_selectable": True})

        offered = self.env["maintenance.equipment"].search(
            [("portal_selectable", "=", True)])
        self.assertIn(published, offered)
        self.assertNotIn(hidden, offered)

    def test_equipment_is_hidden_from_the_portal_by_default(self):
        """Opt in, not opt out: a new asset must not leak the moment it exists."""
        fresh = self.env["maintenance.equipment"].create({"name": "New pump"})
        self.assertFalse(fresh.portal_selectable)
