"""The control that keeps the day job and Majal apart.

Worth testing precisely because it is the one rule here that exists for a
reason outside the software. A constraint nobody exercises is a comment.
"""

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestProvenance(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = cls.env.ref("majal_sales_ops.source_own_research")

    def test_a_source_naming_the_employer_is_refused(self):
        for code in ("odoo_crm", "odoo_upsell", "odoo_churn", "employer_crm"):
            with self.assertRaises(ValidationError, msg=code), self.cr.savepoint():
                self.env["majal.lead.source"].create({
                    "name": "Imported list", "code": code, "kind": "own_research",
                })

    def test_the_check_reads_the_name_too_not_only_the_code(self):
        """Renaming around a check is exactly what a hurried person does."""
        with self.assertRaises(ValidationError):
            self.env["majal.lead.source"].create({
                "name": "Odoo customer export", "code": "list_a",
                "kind": "own_research",
            })

    def test_a_permitted_source_cannot_be_renamed_into_a_forbidden_one(self):
        """A constraint fires on write, which is why this is not a create filter."""
        source = self.env["majal.lead.source"].create({
            "name": "Trade show list", "code": "show_2026", "kind": "event",
        })
        with self.assertRaises(ValidationError):
            source.write({"name": "Odoo upsell accounts"})

    def test_a_managed_lead_must_say_where_it_came_from(self):
        with self.assertRaises(ValidationError):
            self.env["crm.lead"].create({
                "name": "Unsourced contractor", "majal_managed": True,
            })

    def test_a_sourced_lead_is_accepted(self):
        lead = self.env["crm.lead"].create({
            "name": "Sourced contractor",
            "majal_managed": True,
            "majal_source_id": self.source.id,
        })
        self.assertTrue(lead.id)

    def test_an_ordinary_crm_lead_is_untouched(self):
        """This module must not make the stock CRM unusable for anything else."""
        lead = self.env["crm.lead"].create({"name": "Someone else's lead"})
        self.assertFalse(lead.majal_managed)
        self.assertFalse(lead.majal_source_id)

    def test_unknown_source_code_fails_loudly(self):
        """An importer that invented missing sources would defeat the point."""
        with self.assertRaises(ValidationError):
            self.env["majal.lead.source"]._get_by_code("no_such_source")
