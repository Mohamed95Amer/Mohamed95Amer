from unittest import SkipTest

from odoo.exceptions import ValidationError
from odoo.tests import TransactionCase, tagged


@tagged("post_install", "-at_install")
class TestDocumentNumbering(TransactionCase):
    """What a company's document references look like is a setting.

    It used to be a Python class attribute and a sequence created lazily at
    padding 4, so a company that calls its RFIs "queries" and numbers them to
    six digits had to edit records in developer mode.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # The mixin lives here but nothing in this module uses it, so the
        # numbering has to be exercised through a register from a module that
        # depends on this one. In the full suite that is always installed; on
        # a construction_base-only run it is not, and skipping says so rather
        # than failing as though the feature were broken.
        if "construction.rfi" not in cls.env:
            raise SkipTest("construction_rfi is not installed")
        cls.project = cls.env["project.project"].create(
            {"name": "Numbering", "is_construction": True,
             "project_code": "NUM"})
        cls.Code = cls.env["construction.document.code"]
        cls.Code._sync()

    def _rule(self, model_name="construction.rfi"):
        return self.Code._for(model_name, self.env.company)

    def _rfi(self, name="Query"):
        return self.env["construction.rfi"].create(
            {"name": name, "project_id": self.project.id,
             "question": "<p>Which detail governs?</p>"})

    def test_every_numbered_register_is_offered(self):
        """A document type missing from a settings screen looks, to the
        person reading it, exactly like one that cannot be configured."""
        found = set(self.Code.search([]).mapped("model_name"))
        for expected in ("construction.rfi", "construction.submittal",
                         "construction.change.event"):
            self.assertIn(expected, found)

    def test_syncing_twice_does_not_duplicate(self):
        """It runs every time the menu is opened."""
        before = self.Code.search_count([])
        self.Code._sync()
        self.assertEqual(self.Code.search_count([]), before)

    def test_the_default_is_what_the_code_always_used(self):
        self.assertEqual(self._rule().prefix, "RFI")
        self.assertTrue(self._rfi().reference.startswith("NUM-RFI-"))

    def test_a_changed_prefix_shows_up_in_the_next_reference(self):
        self._rule().prefix = "QRY"
        self.assertTrue(self._rfi().reference.startswith("NUM-QRY-"))

    def test_changing_the_prefix_does_not_restart_the_count(self):
        """The sharp edge. Keying the sequence on the visible prefix would
        look tidier and would silently reset a two-year-old register to 1.
        """
        first = self._rfi().reference
        self._rule().prefix = "QRY"
        second = self._rfi().reference

        self.assertGreater(int(second.rsplit("-", 1)[1]),
                           int(first.rsplit("-", 1)[1]))

    def test_references_already_issued_are_left_alone(self):
        existing = self._rfi()
        issued = existing.reference
        self._rule().prefix = "QRY"
        existing.invalidate_recordset()
        self.assertEqual(existing.reference, issued)

    def test_padding_is_written_through_to_the_sequence(self):
        rule = self._rule()
        rule.padding = 6
        self.assertEqual(rule._sequence().padding, 6)
        self.assertRegex(self._rfi().reference, r"-\d{6}$")

    def test_a_prefix_with_a_dash_is_refused(self):
        """The reference is read back by people and split on the dash."""
        with self.assertRaises(ValidationError):
            self._rule().prefix = "R-FI"

    def test_a_blank_or_oversized_prefix_is_refused(self):
        for bad in ("   ", "WAYTOOLONGPREFIX"):
            with self.assertRaises(ValidationError):
                self._rule().prefix = bad

    def test_padding_outside_the_usable_range_is_refused(self):
        for bad in (0, 11):
            with self.assertRaises(ValidationError):
                self._rule().padding = bad

    def test_a_company_rule_beats_the_blank_one(self):
        company = self.env["res.company"].create({"name": "Second Contractor"})
        self.Code.create({
            "name": "RFI", "model_name": "construction.rfi",
            "prefix": "TQ", "company_id": company.id})

        self.assertEqual(self._for_company("construction.rfi", company).prefix,
                         "TQ")
        # and the other company is untouched
        self.assertEqual(self._rule().prefix, "RFI")

    def _for_company(self, model_name, company):
        return self.Code._for(model_name, company)
