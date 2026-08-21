#!/usr/bin/env python3
"""Fill in what a lead list did not say, using the free local model.

Runs entirely on Ollama. This is the clearest case of the rule the whole
system is built on: classifying two thousand companies is the same small
judgement made two thousand times, which is exactly the work that must never
touch a metered subscription. The prompt below was worth a few minutes of the
paid tier once; applying it is worth nothing per row, for ever.

    python enrich_leads.py --limit 100          # dry run, prints what it would set
    python enrich_leads.py --limit 100 --commit

Only fields the importer could not determine are touched, and a lead is never
overwritten once a human has set something on it.
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))

import route                          # noqa: E402
from majal_odoo import MajalOdoo      # noqa: E402

SYSTEM = """You classify construction companies for a B2B sales pipeline.
You are given whatever is known about one company. Answer only from that
evidence. Guessing produces a wrong sales call, so when the evidence does not
support a value, return null for it rather than your best guess.

Return JSON with exactly these keys:
  segment  one of: contractor, subcontractor, developer, consultant, fm, other
  size     one of: micro, small, medium, large, or null
             micro under 20 staff, small 20-99, medium 100-499, large 500+
  role     the contact's role, one of: owner, commercial, project, it, other,
           or null. owner = owner/founder/CEO/MD. commercial = QS, estimating,
           contracts, cost. project = project or site management, planning.
  lang     "ar" or "en" - the language this company most likely does business
           in. Gulf and Egyptian contractors default to "ar" unless the
           evidence is clearly an international firm working in English.
  reason   one short sentence naming the evidence you used."""

ALLOWED = {
    "segment": {"contractor", "subcontractor", "developer", "consultant",
                "fm", "other"},
    "size": {"micro", "small", "medium", "large"},
    "role": {"owner", "commercial", "project", "it", "other"},
    "lang": {"ar", "en"},
}


def describe(lead):
    parts = [
        "Company: %s" % (lead.get("partner_name") or lead.get("name") or "?"),
        "Contact: %s" % (lead.get("contact_name") or "unknown"),
        "Job title: %s" % (lead.get("function") or "unknown"),
        "Website: %s" % (lead.get("website") or "unknown"),
        "Email: %s" % (lead.get("email_from") or "unknown"),
        "Country: %s" % (lead.get("majal_country_code") or "unknown"),
    ]
    if lead.get("description"):
        parts.append("Notes: %s" % lead["description"][:500])
    return "\n".join(parts)


def clean(answer):
    """Keep only values the model was allowed to return."""
    result = {}
    for key, permitted in ALLOWED.items():
        value = answer.get(key)
        if isinstance(value, str) and value.lower() in permitted:
            result[key] = value.lower()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    status = route.available()
    if not status["muscle"]:
        raise SystemExit(
            "The local model is not answering, and this script deliberately "
            "will not fall back to a paid tier for bulk work — that is the "
            "cost control, not an inconvenience.\nStart it with `ollama serve` "
            "(and `ollama pull %s` if you have not)." % route.MUSCLE_MODEL)

    odoo = MajalOdoo()
    leads = odoo.leads_needing_research(limit=args.limit)
    print("%s leads to enrich, on %s (free, local)\n"
          % (len(leads), route.MUSCLE_MODEL))

    changed = skipped = failed = 0
    for lead in leads:
        try:
            answer = route.muscle_json(describe(lead), system=SYSTEM)
        except Exception as error:                       # noqa: BLE001
            print("  ! %-34s %s" % (lead.get("partner_name") or lead["id"],
                                    str(error)[:70]))
            failed += 1
            continue

        values = clean(answer)
        updates = {}
        if values.get("segment"):
            updates["majal_segment"] = values["segment"]
        if values.get("size"):
            updates["majal_size_band"] = values["size"]
        if values.get("role"):
            updates["majal_role_class"] = values["role"]
        if values.get("lang"):
            updates["majal_lang"] = values["lang"]

        if not updates:
            skipped += 1
            print("  - %-34s no confident answer" % (
                lead.get("partner_name") or lead["id"]))
            continue

        print("  %s %-34s %s" % (
            "✓" if args.commit else "·",
            (lead.get("partner_name") or str(lead["id"]))[:34],
            " ".join("%s=%s" % (k.replace("majal_", "").replace("_band", ""), v)
                     for k, v in updates.items())))
        if answer.get("reason"):
            print("      %s" % str(answer["reason"])[:100])
        if args.commit:
            odoo.write("crm.lead", [lead["id"]], updates)
        changed += 1

    print("\n%s enriched, %s left alone, %s failed."
          % (changed, skipped, failed))
    if not args.commit:
        print("Dry run — nothing written. Re-run with --commit.")


if __name__ == "__main__":
    main()
