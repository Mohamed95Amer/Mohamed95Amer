#!/usr/bin/env bash
# Fetch the Odoo 18.0 Community source code, pinned to the exact commit
# recorded in ODOO_PINNED_SHA, into vendor/odoo (gitignored).
#
# The source is NOT committed to this repository (a shallow tree is ~500 MB);
# this script makes the fetch fully reproducible instead. Docker runs use the
# official odoo:18.0 image and do not need this; run it for bare-metal
# development or to read/debug core source.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(cat "$HERE/ODOO_PINNED_SHA" | tr -d '[:space:]')"
DEST="$HERE/vendor/odoo"

if [ -d "$DEST/.git" ]; then
    echo ">> vendor/odoo already exists, fetching pin $SHA"
    git -C "$DEST" fetch --depth 1 origin "$SHA"
    git -C "$DEST" checkout -q "$SHA"
else
    echo ">> Cloning odoo/odoo @ 18.0 (shallow)"
    git clone --depth 1 --branch 18.0 --single-branch \
        https://github.com/odoo/odoo.git "$DEST"
    CURRENT="$(git -C "$DEST" rev-parse HEAD)"
    if [ "$CURRENT" != "$SHA" ]; then
        echo ">> Tip of 18.0 ($CURRENT) != pin, fetching pinned commit $SHA"
        git -C "$DEST" fetch --depth 1 origin "$SHA"
        git -C "$DEST" checkout -q "$SHA"
    fi
fi

echo ">> Odoo source ready at vendor/odoo ($(git -C "$DEST" rev-parse HEAD))"
