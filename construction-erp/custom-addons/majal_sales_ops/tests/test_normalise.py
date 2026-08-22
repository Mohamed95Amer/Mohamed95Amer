"""The comparison keys, tested on the shapes a real list actually contains.

These are pure functions and need no database — but the case still derives from
Odoo's TransactionCase rather than unittest.TestCase. Odoo's runner reads a
`test_module` attribute that its own base classes provide, so a bare
unittest.TestCase in a module's tests package fails collection with
`AttributeError: 'TestNormalise' object has no attribute 'test_module'` and
takes the whole database initialisation down with it.

The transaction these tests open goes unused, which costs a few milliseconds
and buys the tests actually running.
"""

from odoo.tests import TransactionCase, tagged

from ..models import normalise


@tagged("post_install", "-at_install")
class TestNormalise(TransactionCase):

    def test_egyptian_mobile_in_every_shape_it_arrives(self):
        for raw in ("0100 123 4567", "+20 100 123 4567", "00201001234567",
                    "1001234567", "(010) 0123-4567"):
            self.assertEqual(
                normalise.to_e164(raw, "EG"), "+201001234567",
                "%r should normalise to one Egyptian number" % raw)

    def test_gulf_mobiles(self):
        self.assertEqual(normalise.to_e164("055 123 4567", "SA"), "+966551234567")
        self.assertEqual(normalise.to_e164("050-123-4567", "AE"), "+971501234567")
        # The country code carries the answer on its own.
        self.assertEqual(normalise.to_e164("+966 55 123 4567"), "+966551234567")
        self.assertEqual(normalise.to_e164("00971501234567"), "+971501234567")

    def test_a_landline_is_not_a_mobile(self):
        """A Cairo landline fails the mobile plan and must not be adopted."""
        self.assertFalse(normalise.to_e164("02 1234567", "EG"))

    def test_junk_returns_false_rather_than_a_guess(self):
        for raw in ("", None, "1234", "not a phone"):
            self.assertFalse(normalise.to_e164(raw, "EG"))

    def test_bare_national_needs_a_country_to_anchor_it(self):
        """Without a default country the same digits belong to nobody."""
        self.assertFalse(normalise.to_e164("1001234567", None))

    def test_free_mail_host_yields_no_company_domain(self):
        """Otherwise every Gmail lead collides into one company."""
        self.assertEqual(normalise.email_domain("ali@alnoor.ae"), "alnoor.ae")
        self.assertFalse(normalise.email_domain("ali@gmail.com"))
        self.assertFalse(normalise.email_domain("not-an-address"))

    def test_website_domain_survives_what_people_paste(self):
        self.assertEqual(
            normalise.website_domain("https://www.majalops.com/features"),
            "majalops.com")
        self.assertEqual(normalise.website_domain("MAJALOPS.COM"), "majalops.com")
        self.assertFalse(normalise.website_domain("nope"))

    def test_legal_suffixes_do_not_split_one_company_into_two(self):
        self.assertEqual(
            normalise.normalise_company("Al Noor Contracting L.L.C."),
            normalise.normalise_company("AL-NOOR CONTRACTING LLC"))

    def test_dedup_key_prefers_the_strongest_identity(self):
        self.assertEqual(
            normalise.dedup_key(company="X", name="Sara",
                                email="a@alnoor.ae",
                                phone_e164="+971501234567"),
            ("email", "a@alnoor.ae"))
        # No address, so the mobile is the best key left.
        self.assertEqual(
            normalise.dedup_key(company="X", name="Sara",
                                phone_e164="+971501234567"),
            ("phone", "+971501234567"))
        # Neither: company and name together, which is only evidence.
        self.assertEqual(
            normalise.dedup_key(company="Al Noor LLC", name="Sara Haddad"),
            ("person", "al noor|sara haddad"))
        self.assertEqual(normalise.dedup_key(), (False, False))

    def test_colleagues_are_not_duplicates_of_each_other(self):
        """The bug a real list found on its first run.

        Seventeen engineers at one municipality shared a mail domain. Keying
        identity on the employer discarded sixteen of them as duplicates of the
        first, and of the 422 collisions that produced, four were genuinely the
        same person.
        """
        first = normalise.dedup_key(
            company="Dubai Municipality", name="Zayed Almarzooqi",
            email="zamohammad@dm.gov.ae", domain="dm.gov.ae")
        second = normalise.dedup_key(
            company="Dubai Municipality", name="Alia Al Rais",
            email="aaalrais@dm.gov.ae", domain="dm.gov.ae")
        self.assertNotEqual(first, second)

    def test_the_same_person_twice_still_collapses(self):
        typed_one_way = normalise.dedup_key(
            company="Emaar", name="Sara Haddad", email="Sara@Emaar.ae")
        typed_another = normalise.dedup_key(
            company="Emaar Properties", name="S. Haddad",
            email="  sara@emaar.ae ")
        self.assertEqual(typed_one_way, typed_another)

    def test_a_profile_url_is_not_a_company_domain(self):
        """A "website" column is full of these on a hand-built list."""
        for host in ("https://linkedin.com/in/someone", "www.linkedin.com",
                     "https://wa.me/971501234567", "instagram.com/majal"):
            self.assertFalse(normalise.website_domain(host), host)
        self.assertEqual(normalise.website_domain("www.trojan.ae"), "trojan.ae")

    # ------------------------------------------------------------------
    # Free mail
    # ------------------------------------------------------------------
    def test_free_mail_is_distinguished_from_no_domain_at_all(self):
        """email_domain answers False for both; the sender needs the
        difference."""
        self.assertTrue(normalise.is_free_mail("ahmed@gmail.com"))
        self.assertTrue(normalise.is_free_mail("  Ahmed@HOTMAIL.com  "))
        self.assertFalse(normalise.is_free_mail("ahmed@gulfcontracting.ae"))
        # Not an address, so not a free-mail address either — the caller must
        # not read False here as "this is a corporate mailbox".
        self.assertFalse(normalise.is_free_mail("not an address"))
        self.assertFalse(normalise.is_free_mail(""))
        self.assertFalse(normalise.is_free_mail(False))

    def test_a_company_on_a_free_host_is_still_free_mail(self):
        """A contractor using a gmail address is the common case here, not an
        edge one: 949 rows of the first real list."""
        self.assertTrue(normalise.is_free_mail("info@yahoo.com"))
        self.assertFalse(normalise.email_domain("info@yahoo.com"))
