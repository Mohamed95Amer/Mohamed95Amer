#!/usr/bin/env python3
"""Load a lead spreadsheet into Majal, saying exactly what it did and did not.

Dry run by default. An importer that writes two thousand rows on its first
invocation and then reports what happened has the order wrong: by the time you
read the report the damage is done and the undo is a database restore.

    python import_leads.py leads.csv --source public_registry
    python import_leads.py leads.csv --source public_registry --commit

The normalisation and de-duplication logic is imported from the addon rather
than reimplemented here. Two copies of a phone parser drift within a month, and
the copy that drifts is always the one that decides whether two rows are the
same company.
"""

import argparse
import csv
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
sys.path.insert(0, os.path.join(
    HERE, "..", "construction-erp", "custom-addons", "majal_sales_ops", "models"))

import normalise                      # noqa: E402  the addon's own parser
from majal_odoo import MajalOdoo      # noqa: E402

# Header guesses, lower-cased and stripped of punctuation. A list assembled by
# hand never uses the same word twice, so this covers what these files actually
# contain rather than what a schema says they should.
COLUMN_HINTS = {
    "partner_name": ("company", "company name", "organisation", "organization",
                     "account", "employer", "firm", "contractor", "الشركة"),
    "contact_name": ("contact", "name", "contact name", "full name", "person",
                     "الاسم"),
    "email_from": ("email", "e mail", "email address", "mail", "البريد"),
    "phone": ("phone", "telephone", "tel", "mobile", "cell", "whatsapp",
              "الهاتف", "الجوال"),
    "website": ("website", "web", "url", "site", "domain"),
    "function": ("title", "job title", "position", "role", "designation"),
    "country": ("country", "market", "location", "الدولة"),
    "city": ("city", "town", "emirate"),
    "size": ("size", "employees", "headcount", "staff", "employee count"),
    "segment": ("segment", "type", "category", "industry"),
}

COUNTRY_ALIASES = {
    "AE": ("ae", "uae", "u a e", "united arab emirates", "dubai", "abu dhabi",
           "sharjah", "الإمارات", "دبي", "أبوظبي"),
    "SA": ("sa", "ksa", "saudi", "saudi arabia", "riyadh", "jeddah", "dammam",
           "السعودية", "الرياض", "جدة"),
    "EG": ("eg", "egypt", "cairo", "giza", "alexandria", "مصر", "القاهرة"),
}

SEGMENT_ALIASES = {
    "contractor": ("contractor", "main contractor", "general contractor",
                   "construction", "building", "مقاولات", "مقاول"),
    "subcontractor": ("subcontractor", "sub contractor", "trade", "مقاول باطن"),
    "developer": ("developer", "real estate", "property", "تطوير", "عقاري"),
    "consultant": ("consultant", "consulting", "engineering", "architect",
                   "استشاري"),
    "fm": ("facilities", "facility", "fm", "maintenance", "صيانة"),
}


def normalise_header(raw):
    return "".join(ch if ch.isalnum() or ch.isspace() else " "
                   for ch in (raw or "").lower()).strip()


def guess_mapping(headers):
    """Match the file's columns to lead fields, best guess per column."""
    mapping, used = {}, set()
    cleaned = {h: normalise_header(h) for h in headers}
    for field, hints in COLUMN_HINTS.items():
        for header, clean in cleaned.items():
            if header in used or not clean:
                continue
            if clean in hints or any(
                clean == hint or clean.startswith(hint + " ") for hint in hints
            ):
                mapping[field] = header
                used.add(header)
                break
    # Second pass: substring match for anything still unclaimed.
    for field, hints in COLUMN_HINTS.items():
        if field in mapping:
            continue
        for header, clean in cleaned.items():
            if header in used or not clean:
                continue
            if any(hint in clean for hint in hints):
                mapping[field] = header
                used.add(header)
                break
    return mapping


def match_alias(value, table):
    text = (value or "").strip().lower()
    if not text:
        return False
    for key, aliases in table.items():
        if text in aliases or any(alias in text for alias in aliases):
            return key
    return False


def size_band(value):
    """Turn whatever is in a headcount column into a band."""
    text = (value or "").strip().lower().replace(",", "")
    if not text:
        return False
    for token in ("micro", "small", "medium", "large"):
        if token in text:
            return token
    digits = "".join(ch for ch in text.split("-")[0] if ch.isdigit())
    if not digits:
        return False
    count = int(digits)
    if count < 20:
        return "micro"
    if count < 100:
        return "small"
    if count < 500:
        return "medium"
    return "large"


def role_class(title):
    text = (title or "").strip().lower()
    if not text:
        return False
    if any(w in text for w in ("owner", "founder", "ceo", "managing director",
                               "chairman", "md", "general manager", "مالك",
                               "مدير عام", "الرئيس التنفيذي")):
        return "owner"
    if any(w in text for w in ("commercial", "quantity surveyor", "qs",
                               "estimator", "cost", "contracts", "تجاري",
                               "كميات")):
        return "commercial"
    if any(w in text for w in ("project", "operations", "construction manager",
                               "site", "planning", "مشروع", "مشاريع")):
        return "project"
    if any(w in text for w in ("it ", "information technology", "systems",
                               "digital", "erp", "تقنية")):
        return "it"
    return "other"


def read_rows(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        sample = handle.read(8192)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(handle, dialect=dialect)
        return reader.fieldnames or [], list(reader)


def build(row, mapping, default_country):
    get = lambda field: (row.get(mapping[field], "") or "").strip() \
        if field in mapping else ""

    country = match_alias(get("country"), COUNTRY_ALIASES) or default_country
    phone = normalise.to_e164(get("phone"), country)
    email = get("email_from").lower()
    domain = normalise.email_domain(email) or normalise.website_domain(
        get("website"))
    company = get("partner_name")
    contact = get("contact_name")

    values = {
        "name": company or contact or email or "Unnamed lead",
        "partner_name": company or False,
        "contact_name": contact or False,
        "email_from": email or False,
        # Falls back to the raw string when the number could not be parsed —
        # a Cairo landline in a mobile column, say. Keeping it loses nothing:
        # the lead's computed majal_phone_e164 stays empty so no agent will
        # ever dial or match on it, but the digits a human typed are still
        # there for a human to look at.
        "phone": phone or get("phone") or False,
        "website": get("website") or False,
        "function": get("function") or False,
        "majal_managed": True,
        "majal_segment": match_alias(get("segment"), SEGMENT_ALIASES)
        or "contractor",
        "majal_size_band": size_band(get("size")),
        "majal_role_class": role_class(get("function")),
        # Arabic is the default for all three markets; the Writer switches a
        # lead to English when the research says the company works in it.
        "majal_lang": "ar",
    }
    key_kind, key_value = normalise.dedup_key(
        company=company, email=email, phone_e164=phone, domain=domain)
    return values, country, ("%s:%s" % (key_kind, key_value)) if key_kind else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--source", required=True,
                        help="Lead source code. Must already exist in Majal.")
    parser.add_argument("--country", default=None,
                        help="Fallback ISO code (AE, SA, EG) for rows whose "
                             "country column is empty or unrecognised.")
    parser.add_argument("--commit", action="store_true",
                        help="Actually write. Without this it is a dry run.")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    headers, rows = read_rows(args.csv_path)
    if args.limit:
        rows = rows[:args.limit]
    mapping = guess_mapping(headers)

    print("File:    %s — %s rows, %s columns" % (
        args.csv_path, len(rows), len(headers)))
    print("Mapping:")
    for field in COLUMN_HINTS:
        print("  %-14s <- %s" % (
            field, mapping.get(field) or "(not found)"))
    unmapped = [h for h in headers if h not in mapping.values()]
    if unmapped:
        print("  ignored columns: %s" % ", ".join(unmapped))
    print()

    odoo = MajalOdoo()
    source = odoo.source_id(args.source)

    existing = {
        lead["majal_dedup_key"]
        for lead in odoo.search_read(
            "crm.lead", [("majal_managed", "=", True)], ["majal_dedup_key"])
        if lead.get("majal_dedup_key")
    }

    seen, accepted, rejected = {}, [], Counter()
    examples = defaultdict(list)

    for number, row in enumerate(rows, start=2):   # row 1 is the header
        values, country, key = build(row, mapping, args.country)

        if not values["email_from"] and not values["phone"]:
            rejected["no email and no usable phone"] += 1
            examples["no email and no usable phone"].append(number)
            continue
        if not key:
            rejected["nothing to identify the company by"] += 1
            examples["nothing to identify the company by"].append(number)
            continue
        if key in existing:
            rejected["already in Majal"] += 1
            examples["already in Majal"].append(number)
            continue
        if key in seen:
            rejected["duplicate within this file"] += 1
            examples["duplicate within this file"].append(
                "%s = row %s" % (number, seen[key]))
            continue
        if not country:
            rejected["country not recognised (pass --country)"] += 1
            examples["country not recognised (pass --country)"].append(number)
            continue

        seen[key] = number
        values["majal_source_id"] = source
        accepted.append((values, country))

    print("Accepted: %s" % len(accepted))
    if rejected:
        print("Rejected: %s" % sum(rejected.values()))
        for reason, count in rejected.most_common():
            shown = ", ".join(str(x) for x in examples[reason][:5])
            more = "" if len(examples[reason]) <= 5 else ", …"
            print("  %-38s %5s   rows %s%s" % (reason, count, shown, more))

    if not args.commit:
        print("\nDry run — nothing written. Re-run with --commit when the "
              "mapping and the rejections above look right.")
        return

    countries = {
        c["code"]: c["id"] for c in odoo.search_read(
            "res.country", [("code", "in", ["AE", "SA", "EG"])], ["code"])
    }
    written = 0
    for values, country in accepted:
        values["country_id"] = countries.get(country, False)
        odoo.create("crm.lead", values)
        written += 1
        if written % 100 == 0:
            print("  … %s written" % written)
    print("\nWritten: %s leads, source %r." % (written, args.source))
    print("Next: open Majal Sales → Pipeline, sort by ICP score, and start "
          "sequences on the top of the list.")


if __name__ == "__main__":
    main()
