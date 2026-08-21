"""A construction user opening a project must not be refused by Property.

`majal_property_construction` adds a Property block to the construction
project form. It was gated with `invisible="development_count == 0"`, which
reads like it hides the block from anyone without property developments --
and it does, visually. But an invisible field is still *read*: the client
requests `development_ids`, and the list sub-view inside it requests fields
on `majal.development`. A construction-only user has no ACL for that model,
so the read raised before the form drew anything.

The effect was that two ordinary construction screens -- Cost-Value
Reconciliation (`construction_report.action_project_cvr`) and Safety
Statistics (`construction_hse.action_project_safety`), both of which open a
project form -- failed for five of the seven shipped demo personas. Found
by a persona sweep that opened each list *and its first record's form*; a
list-only sweep sees none of this, because the list arch does not carry the
Property block.

`groups=` is the fix rather than `invisible=`: it removes the block from
the arch the user is served, so nothing asks for the field at all.
"""

from odoo.tests import TransactionCase, new_test_user, tagged


@tagged("post_install", "-at_install")
class TestProjectFormStaysReadable(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.company = cls.env["res.company"].create({"name": "Form Co"})
        cls.project = cls.env["project.project"].sudo().create({
            "name": "Readable Tower",
            "is_construction": True,
            "company_id": cls.company.id,
        })

    def _construction_user(self):
        """A construction user, whether or not majal_administration is here.

        This module does not depend on majal_administration, so the tenant
        fields may not exist -- and referencing them unconditionally made
        the first version of this test raise AttributeError in an isolated
        install. That failure looked exactly like the defect being tested,
        which is the mistake this whole audit keeps finding in other
        people's work.
        """
        user = new_test_user(
            self.env, login="form.construction",
            password="form-construction-pw-2026",
            groups="construction_base.group_construction_manager",
            company_id=self.company.id,
            company_ids=[(6, 0, [self.company.id])])
        self._grant_tenant_access(user)
        return user

    def _grant_tenant_access(self, user):
        fields_ = self.env["res.users"]._fields
        if "majal_industry_scope" in fields_:
            user.majal_industry_scope = "construction"
        if "majal_role_id" in fields_:
            senior = self.env["majal.access.role"].search(
                [("rank", ">=", 40)], order="rank", limit=1)
            if senior:
                user.majal_role_id = senior.id
        if "majal_manager_id" in self.env["project.project"]._fields:
            self.project.sudo().majal_manager_id = user.id

    def test_the_property_block_is_not_served_to_a_construction_user(self):
        """The arch itself must not mention the Property models."""
        user = self._construction_user()
        arch = self.env["project.project"].with_user(user).get_view(
            self.env.ref("construction_base.view_project_form_construction").id,
            "form")["arch"]
        # The element, not the raw string: the first version of this
        # assertion matched the explanatory XML comment in the view itself
        # and reported a working fix as broken.
        self.assertNotIn(
            'name="development_ids"', arch,
            "The Property block was served to a construction-only user. It "
            "will be read, and majal.development is not readable by them.")

    def test_a_construction_user_can_read_what_the_form_asks_for(self):
        """The failure as the personas met it.

        Reads exactly the fields the served arch names, which is what the
        client actually requests. An earlier version read every field in
        get_view()["models"], which includes ones the postprocessor strips
        for this user -- it failed on `stage_id` and had nothing to do with
        Property.
        """
        import re

        user = self._construction_user()
        model = self.env["project.project"].with_user(user)
        arch = model.get_view(
            self.env.ref("construction_base.view_project_form_construction").id,
            "form")["arch"]
        names = set(re.findall(r'<field[^>]*name="([^"]+)"', arch))
        names &= set(self.env["project.project"]._fields)
        self.env.invalidate_all()
        # Would raise AccessError on majal.development before the fix.
        model.browse(self.project.id).read(sorted(names))

    def test_a_property_user_still_gets_the_block(self):
        """Closing the hole must not close the feature."""
        user = new_test_user(
            self.env, login="form.property", password="form-property-pw-2026",
            groups="construction_base.group_construction_manager,"
                   "majal_real_estate.group_majal_real_estate_user",
            company_id=self.company.id,
            company_ids=[(6, 0, [self.company.id])])
        self._grant_tenant_access(user)
        arch = self.env["project.project"].with_user(user).get_view(
            self.env.ref("construction_base.view_project_form_construction").id,
            "form")["arch"]
        self.assertIn(
            'name="development_ids"', arch,
            "A Property user lost the Property block on the project form.")
