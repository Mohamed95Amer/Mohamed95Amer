"""Turning what a human typed into something two rows can be compared on.

A lead list assembled by hand across three countries arrives with the same
company written four ways and the same mobile written six. Egypt alone
produces `0100 123 4567`, `+20 100 123 4567`, `0020100123456` and
`100-123-4567`, and none of them match as strings. Deduplication is only as
good as the normalisation in front of it, so that work happens here, in
functions that need no database and can be tested directly.

Everything is deliberately conservative: when a value cannot be understood it
is returned as ``False`` rather than guessed at. A wrong number that looks
right is worse than a blank one, because the blank gets fixed and the wrong one
gets dialled.
"""

import re

# The three markets this pipeline sells into. `trunk` is the national prefix
# people write locally and drop when dialling internationally; `mobile_lead`
# lists the first digit(s) a mobile subscriber number can start with, which is
# what tells a mobile apart from a landline in each plan.
COUNTRY_DIAL = {
    "EG": {"cc": "20", "trunk": "0", "mobile_lead": ("10", "11", "12", "15"),
           "national_len": 10},
    "SA": {"cc": "966", "trunk": "0", "mobile_lead": ("5",), "national_len": 9},
    "AE": {"cc": "971", "trunk": "0", "mobile_lead": ("5",), "national_len": 9},
}

_NON_DIGIT = re.compile(r"[^\d+]")
_MULTI_PLUS = re.compile(r"\++")

# Mail hosts that tell you nothing about the company. A lead whose only address
# is on one of these cannot be de-duplicated by domain, and more importantly
# cannot be matched to a company at all, so the domain key must stay empty
# rather than becoming "gmail.com" and colliding with every other such lead.
FREE_MAIL_HOSTS = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
    "protonmail.com", "proton.me", "yandex.com", "mail.ru", "gmx.com",
    "zoho.com", "qq.com", "163.com",
})

_EMAIL = re.compile(r"^[^@\s]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$")

# Hosts that appear in a "website" column but are somebody's profile, not their
# company. A real list is full of these: 34 rows in the first import carried
# linkedin.com as their website, and treating that as a company domain makes
# thirty-four unrelated people look like colleagues.
NON_COMPANY_HOSTS = frozenset({
    "linkedin.com", "lnkd.in", "facebook.com", "fb.com", "instagram.com",
    "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
    "wa.me", "whatsapp.com", "t.me", "telegram.me", "snapchat.com",
    "google.com", "goo.gl", "maps.app.goo.gl", "bit.ly", "linktr.ee",
    "behance.net", "medium.com", "wordpress.com", "blogspot.com",
})


def clean_digits(raw):
    """Strip a phone number down to digits and at most one leading plus."""
    if not raw:
        return ""
    value = _NON_DIGIT.sub("", str(raw).strip())
    value = _MULTI_PLUS.sub("+", value)
    if value.startswith("+"):
        return "+" + value[1:].replace("+", "")
    return value.replace("+", "")


def to_e164(raw, default_country=None):
    """Best-effort E.164, or ``False`` when the number cannot be trusted.

    Handles the four shapes these lists actually contain: already
    international (`+20…`), the ISO-dialled form (`0020…`), national with a
    trunk zero (`0100…`), and bare national (`100…`). The last one is only
    accepted when a default country is supplied and the length and leading
    digits agree with that country's plan — without that check `1001234567`
    would be silently adopted by whichever country was asked first.
    """
    value = clean_digits(raw)
    if not value:
        return False

    if value.startswith("00"):
        value = "+" + value[2:]

    if value.startswith("+"):
        digits = value[1:]
        for spec in COUNTRY_DIAL.values():
            cc = spec["cc"]
            if digits.startswith(cc) and _is_plausible(digits[len(cc):], spec):
                return "+" + digits
        # An international number outside the three target markets is still a
        # real number; it simply is not one this pipeline can validate.
        return "+" + digits if 8 <= len(digits) <= 15 else False

    spec = COUNTRY_DIAL.get(default_country)
    if not spec:
        return False

    trunk = spec["trunk"]
    national = value[len(trunk):] if trunk and value.startswith(trunk) else value

    # A local list often carries the country code with no plus at all.
    if national.startswith(spec["cc"]) and _is_plausible(
        national[len(spec["cc"]):], spec
    ):
        return "+" + national

    return "+" + spec["cc"] + national if _is_plausible(national, spec) else False


def _is_plausible(national, spec):
    """Does this subscriber number fit the country's mobile plan?"""
    return (
        national.isdigit()
        and len(national) == spec["national_len"]
        and national.startswith(spec["mobile_lead"])
    )


def email_domain(raw):
    """The company domain behind an address, or ``False``.

    Free mail hosts return ``False`` on purpose — see FREE_MAIL_HOSTS.
    """
    if not raw:
        return False
    match = _EMAIL.match(str(raw).strip().lower())
    if not match:
        return False
    domain = match.group(1)
    return False if domain in FREE_MAIL_HOSTS else domain


def website_domain(raw):
    """The bare domain from anything a person might paste into a website box."""
    if not raw:
        return False
    value = str(raw).strip().lower()
    value = re.sub(r"^[a-z]+://", "", value)
    value = value.split("/")[0].split("?")[0].split("@")[-1]
    if value.startswith("www."):
        value = value[4:]
    value = value.split(":")[0]
    if not re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", value):
        return False
    return False if value in NON_COMPANY_HOSTS or value in FREE_MAIL_HOSTS else value


def normalise_company(raw):
    """A comparison key for a company name, not a display name.

    Drops the legal suffix and the punctuation around it, because "Al Noor
    Contracting L.L.C." and "AL-NOOR CONTRACTING LLC" are one company and one
    lead. The original string is always kept for display; only the key is
    flattened.
    """
    if not raw:
        return ""
    value = str(raw).lower()
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    words = [w for w in value.split() if w not in _LEGAL_SUFFIXES]
    return " ".join(words)


_LEGAL_SUFFIXES = frozenset({
    "llc", "l", "c", "ltd", "limited", "inc", "co", "company", "corp",
    "corporation", "wll", "fze", "fzc", "fzco", "est", "establishment",
    "group", "holding", "holdings", "sae", "sarl", "plc", "pjsc", "psc",
    "contracting", "contractors", "contractor",
    "شركة", "ذ", "م", "المحدودة", "للمقاولات", "مقاولات",
})


def dedup_key(company=None, name=None, email=None, phone_e164=None, domain=None):
    """The strongest identity available for one *person*, most reliable first.

    A lead is a person, not an employer. This keyed on the company domain
    once, which reads as reasonable and is badly wrong on a real list: the
    first import carried seventeen engineers at one municipality and sixteen at
    another, and every one of them after the first would have been discarded as
    a duplicate of a colleague. Of the 422 collisions that produced, four were
    genuinely the same person.

    So the company domain is not an identity here. It is still recorded on the
    lead, and it is still what groups colleagues together and what an inbound
    website form matches against — but two people who share an employer are two
    leads.

    Returned as a ``(kind, value)`` pair so a caller can tell an exact match on
    an address from the weaker company-and-name guess.
    """
    if email:
        cleaned = str(email).strip().lower()
        if "@" in cleaned:
            return ("email", cleaned)
    if phone_e164:
        return ("phone", phone_e164)
    company_key = normalise_company(company)
    name_key = " ".join((name or "").lower().split())
    if company_key and name_key:
        return ("person", "%s|%s" % (company_key, name_key))
    return ("person", name_key or company_key) if (name_key or company_key) \
        else (False, False)
