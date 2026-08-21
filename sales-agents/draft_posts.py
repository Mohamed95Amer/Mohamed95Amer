#!/usr/bin/env python3
"""Turn material Majal already owns into a week of social drafts.

Majal has four insight articles, three industry walkthrough videos and around
twenty product screenshots on majalops.com. That is a content library; it was
just never being spent. This reads a source file, produces captions from it on
the free local model, and queues them in Majal for approval.

Nothing is posted here. Drafts land in the same approval queue as outreach, and
the publishers only ever look at what came out of it approved.

    python draft_posts.py --source construction-erp/website/insights/approval-trails.html \\
        --pillar approval_trails --count 3
"""

import argparse
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))

import route                          # noqa: E402
from majal_odoo import MajalOdoo      # noqa: E402

# Deliberately tight. A caption written to fill a character limit reads like
# one, and the audience here is a contractor scrolling between site meetings.
LIMITS = {"linkedin": 900, "instagram": 500, "tiktok": 220}

SYSTEM = """You write short social posts for Majal, an operations platform for
construction contractors in the UAE, Saudi Arabia and Egypt.

Voice: plain, specific, and written by somebody who has seen a site. State one
concrete operational problem and what changes when it is solved. No hype, no
emoji walls, no "revolutionise", no "game-changer", no rhetorical questions
stacked three deep. A quantity surveyor should recognise their own week in it.

Never invent a customer, a number, a case study or a result. Majal has no
published customer results yet, so any specific claim you make up is a lie
somebody will be asked about in a meeting.

Return JSON: {"posts": [{"platform": "...", "lang": "ar"|"en", "body": "...",
"label": "short internal name"}]}"""


def extract_text(path):
    """Readable prose out of an HTML article or a plain text file."""
    raw = open(path, encoding="utf-8", errors="replace").read()
    if path.lower().endswith((".html", ".htm")):
        raw = re.sub(r"(?is)<(script|style|nav|footer|svg)[^>]*>.*?</\1>", " ", raw)
        raw = re.sub(r"(?s)<[^>]+>", " ", raw)
        raw = html.unescape(raw)
    return re.sub(r"\s+", " ", raw).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True,
                        help="An article, doc or text file to draw on.")
    parser.add_argument("--pillar", required=True, choices=[
        "commercial_leakage", "offline_site", "arabic_first",
        "approval_trails", "product"])
    parser.add_argument("--platforms", default="linkedin,instagram",
                        help="Comma separated. TikTok drafts are queued but "
                             "must be finished by hand in the app.")
    parser.add_argument("--count", type=int, default=2,
                        help="Posts per platform.")
    parser.add_argument("--lang", default="en", choices=["en", "ar", "both"])
    parser.add_argument("--media", default=None,
                        help="Path or URL of the image or video. Required for "
                             "Instagram and TikTok.")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()

    if not route.available()["muscle"]:
        raise SystemExit(
            "Local model not answering — start `ollama serve`. Drafting "
            "captions in bulk is muscle work and does not use the paid tier.")

    platforms = [p.strip() for p in args.platforms.split(",") if p.strip()]
    for platform in platforms:
        if platform in ("instagram", "tiktok") and not args.media:
            raise SystemExit(
                "%s posts carry media — pass --media. Majal already has "
                "screenshots and three walkthrough videos under "
                "construction-erp/website/assets/." % platform)

    text = extract_text(args.source)
    languages = ["en", "ar"] if args.lang == "both" else [args.lang]

    prompt = """Source material:
---
%s
---

Write %s post(s) for each of these platforms: %s.
Languages: %s. Write Arabic posts in natural Modern Standard Arabic, not a
translation of the English one.
Length limits, in characters: %s.
Theme: %s.""" % (
        text[:6000], args.count, ", ".join(platforms), ", ".join(languages),
        ", ".join("%s %s" % (p, LIMITS[p]) for p in platforms),
        args.pillar.replace("_", " "),
    )

    answer = route.muscle_json(prompt, system=SYSTEM)
    posts = answer.get("posts") or []
    if not posts:
        raise SystemExit("The model returned no posts. Try a longer source.")

    odoo = MajalOdoo() if args.commit else None
    queued = 0
    for post in posts:
        platform = str(post.get("platform", "")).lower()
        if platform not in platforms:
            continue
        body = (post.get("body") or "").strip()
        if not body:
            continue
        limit = LIMITS[platform]
        if len(body) > limit:
            body = body[:limit].rsplit(" ", 1)[0] + "…"

        label = post.get("label") or "%s %s" % (platform, args.pillar)
        print("\n--- %s / %s (%s chars) — %s"
              % (platform, post.get("lang", "en"), len(body), label))
        print(body)
        if platform == "tiktok":
            print("[queued as a draft: TikTok forces unaudited API posts to "
                  "SELF_ONLY, so you finish this one in the app]")

        if args.commit:
            odoo.queue_post({
                "name": label[:80],
                "platform": platform,
                "lang": post.get("lang") if post.get("lang") in ("ar", "en") else "en",
                "body": body,
                "pillar": args.pillar,
                "media_path": args.media or False,
            })
            queued += 1

    if args.commit:
        print("\n%s posts queued for approval in Majal Sales → Social Posts."
              % queued)
    else:
        print("\nDry run — nothing queued. Re-run with --commit.")


if __name__ == "__main__":
    main()
