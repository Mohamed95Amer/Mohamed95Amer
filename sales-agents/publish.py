#!/usr/bin/env python3
"""Post what Majal has approved, and report back what the platform said.

    python publish.py linkedin
    python publish.py instagram
    python publish.py --all --dry-run

Only approved, due items are ever fetched: the queue in Majal is the authority
on what may go out, and this script has no opinion about it.

Two platform facts are enforced here rather than discovered at three in the
morning.

Instagram will not accept a file. The Graph API takes a *publicly reachable
URL*, downloads it itself, and fails opaquely if it cannot. Majal's own assets
are already public on majalops.com, which is the easiest correct answer, so a
local path is refused up front with that suggestion.

TikTok is absent on purpose. Its Content Posting API forces every post from an
unaudited app to SELF_ONLY — visible to nobody — so publishing there
automatically would produce a queue full of items marked "published" that no
human being can see. Those stay in Majal's manual tray until the app passes
TikTok's audit.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))

from majal_odoo import MajalOdoo      # noqa: E402

LINKEDIN_VERSION = os.environ.get("MAJAL_LINKEDIN_VERSION", "202505")
GRAPH_VERSION = os.environ.get("MAJAL_GRAPH_VERSION", "v21.0")


def http(url, data=None, headers=None, method=None):
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            text = response.read().decode("utf-8")
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:600]
        raise RuntimeError("HTTP %s from %s: %s"
                           % (error.code, url.split("?")[0], detail)) from error


def need(name, why):
    value = os.environ.get(name)
    if not value:
        raise SystemExit("%s is not set. %s" % (name, why))
    return value


# ----------------------------------------------------------------------
def publish_linkedin(post, dry_run=False):
    """Post to the member's own feed.

    `w_member_social` on a personal profile is self-serve — it needs no
    partner approval, which is why this is the one social channel that works
    on day one. A company *Page* would need Community Management API access
    and a review measured in months.
    """
    token = need("MAJAL_LINKEDIN_TOKEN",
                 "Create it with the 'Share on LinkedIn' product and the "
                 "w_member_social scope. Note it expires in about 60 days.")
    urn = os.environ.get("MAJAL_LINKEDIN_URN")
    headers = {
        "Authorization": "Bearer %s" % token,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_VERSION,
    }
    if not urn:
        who = http("https://api.linkedin.com/v2/userinfo", headers=headers)
        urn = "urn:li:person:%s" % who["sub"]
        print("    (author %s — set MAJAL_LINKEDIN_URN to skip this lookup)" % urn)

    payload = {
        "author": urn,
        "commentary": post["body"],
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if dry_run:
        return "dry-run"
    http("https://api.linkedin.com/rest/posts", data=payload, headers=headers)
    # The id comes back in a header rather than the body; the queue only needs
    # to know it went, so a timestamped marker is honest and sufficient.
    return "linkedin:%s" % int(time.time())


def publish_instagram(post, dry_run=False):
    """Two-step container publish against the Graph API."""
    token = need("MAJAL_IG_TOKEN", "A long-lived Instagram Graph API token.")
    ig_user = need("MAJAL_IG_USER_ID",
                   "The Instagram Business/Creator account id. Personal "
                   "accounts cannot use the API at all.")
    media = post.get("media_path") or ""
    if not media.lower().startswith(("http://", "https://")):
        raise RuntimeError(
            "Instagram needs a public URL, not a file path (%r). Meta fetches "
            "the media itself. Majal's assets are already public — use "
            "https://majalops.com/assets/img/… or upload the file there first."
            % media)

    is_video = media.lower().split("?")[0].endswith((".mp4", ".mov"))
    params = {
        "caption": post["body"],
        "access_token": token,
        ("video_url" if is_video else "image_url"): media,
    }
    if is_video:
        params["media_type"] = "REELS"
    if dry_run:
        return "dry-run"

    base = "https://graph.facebook.com/%s/%s" % (GRAPH_VERSION, ig_user)
    container = http("%s/media?%s" % (base, urllib.parse.urlencode(params)),
                     data={}, method="POST")
    creation_id = container["id"]

    # Video containers are not ready the instant they are created, and
    # publishing an unfinished one fails with a message that does not say so.
    if is_video:
        for _ in range(30):
            status = http(
                "https://graph.facebook.com/%s/%s?fields=status_code&access_token=%s"
                % (GRAPH_VERSION, creation_id, urllib.parse.quote(token)))
            if status.get("status_code") == "FINISHED":
                break
            if status.get("status_code") == "ERROR":
                raise RuntimeError("Instagram could not process the video.")
            time.sleep(5)

    published = http(
        "%s/media_publish?%s" % (base, urllib.parse.urlencode(
            {"creation_id": creation_id, "access_token": token})),
        data={}, method="POST")
    return published.get("id")


PUBLISHERS = {"linkedin": publish_linkedin, "instagram": publish_instagram}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", nargs="?", choices=sorted(PUBLISHERS))
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    if not args.platform and not args.all:
        parser.error("name a platform, or pass --all")
    platforms = sorted(PUBLISHERS) if args.all else [args.platform]

    odoo = MajalOdoo()
    total = failures = 0
    for platform in platforms:
        queue = odoo.publishing_queue(platform=platform, limit=args.limit)
        print("%s: %s approved and due" % (platform, len(queue)))
        for post in queue:
            preview = post["body"].replace("\n", " ")[:70]
            try:
                external = PUBLISHERS[platform](post, dry_run=args.dry_run)
                if args.dry_run:
                    print("  · would post: %s…" % preview)
                    continue
                odoo.mark_published(post["id"], external_id=external)
                print("  ✓ %s… -> %s" % (preview, external))
                total += 1
            except Exception as error:                   # noqa: BLE001
                message = str(error)[:200]
                print("  ! %s… failed: %s" % (preview, message))
                if not args.dry_run:
                    # Recorded against the post so the failure is visible in
                    # My Day rather than only in a console nobody reopens.
                    odoo.mark_failed(post["id"], message)
                failures += 1

    if args.dry_run:
        print("\nDry run — nothing posted.")
    else:
        print("\n%s published, %s failed." % (total, failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
