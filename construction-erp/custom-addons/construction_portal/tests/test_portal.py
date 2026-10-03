from odoo.exceptions import AccessError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestConstructionPortal(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.project = cls.env["project.project"].create(
            {"name": "Portal Test", "is_construction": True})
        portal_group = cls.env.ref("base.group_portal")

        # Two distinct subcontractor companies, each with a portal login.
        cls.partner_a = cls.env["res.partner"].create(
            {"name": "Sub A", "is_company": True})
        cls.partner_b = cls.env["res.partner"].create(
            {"name": "Sub B", "is_company": True})
        cls.user_a = cls.env["res.users"].create({
            "name": "Sub A user", "login": "sub_a_portal",
            "partner_id": cls.partner_a.id,
            "groups_id": [(6, 0, [portal_group.id])],
        })

        cls.defect_a = cls.env["construction.defect"].create({
            "name": "Cracked tile", "project_id": cls.project.id,
            "responsible_subcontractor_id": cls.partner_a.id,
        })
        cls.defect_b = cls.env["construction.defect"].create({
            "name": "Loose socket", "project_id": cls.project.id,
            "responsible_subcontractor_id": cls.partner_b.id,
        })
        cls.sub_a = cls.env["construction.subcontract"].create({
            "name": "MEP package", "project_id": cls.project.id,
            "subcontractor_id": cls.partner_a.id,
        })

    def test_portal_sees_only_own_defects(self):
        defects = self.env["construction.defect"].with_user(
            self.user_a).search([])
        self.assertIn(self.defect_a, defects)
        self.assertNotIn(self.defect_b, defects)

    def test_portal_denied_reading_other_defect(self):
        with self.assertRaises(AccessError):
            self.defect_b.with_user(self.user_a).check_access("read")

    def test_portal_sees_own_subcontract(self):
        subs = self.env["construction.subcontract"].with_user(
            self.user_a).search([])
        self.assertEqual(subs, self.sub_a)

    def test_portal_cannot_write_defect(self):
        with self.assertRaises(AccessError):
            self.defect_a.with_user(self.user_a).write({"name": "hacked"})

    def test_access_url_points_to_portal(self):
        self.assertEqual(self.defect_a.access_url, f"/my/defect/{self.defect_a.id}")
        self.assertEqual(self.sub_a.access_url, f"/my/subcontract/{self.sub_a.id}")
