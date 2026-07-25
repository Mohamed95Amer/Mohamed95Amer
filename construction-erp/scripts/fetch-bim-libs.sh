#!/usr/bin/env bash
# Fetch the BIM viewer's third-party libraries.
#
# They are not committed: web-ifc's IIFE bundle alone is 6 MB, and the repo
# already treats large upstream code the same way (Odoo core is pinned and
# fetched, OCA modules are small enough to vendor). Pinned by exact version so
# a fetch is reproducible.
#
#   scripts/fetch-bim-libs.sh
set -euo pipefail

WEB_IFC_VERSION="0.0.77"      # MPL-2.0 — https://github.com/ThatOpen/engine_web-ifc
THREE_VERSION="0.170.0"       # MIT     — https://github.com/mrdoob/three.js

HERE="$(cd "$(dirname "$0")/.." && pwd)"
LIB="$HERE/custom-addons/construction_bim/static/lib"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$LIB/web-ifc" "$LIB/three"

echo "==> web-ifc $WEB_IFC_VERSION"
npm pack "web-ifc@$WEB_IFC_VERSION" --pack-destination "$TMP" >/dev/null
tar xzf "$TMP/web-ifc-$WEB_IFC_VERSION.tgz" -C "$TMP"
cp "$TMP/package/web-ifc-api-iife.js" "$LIB/web-ifc/"
cp "$TMP/package/web-ifc.wasm" "$LIB/web-ifc/"
cp "$TMP/package/LICENSE.md" "$LIB/web-ifc/"

echo "==> three $THREE_VERSION"
npm pack "three@$THREE_VERSION" --pack-destination "$TMP" >/dev/null
tar xzf "$TMP/three-$THREE_VERSION.tgz" -C "$TMP"
cp "$TMP/package/build/three.module.min.js" "$LIB/three/"
cp "$TMP/package/LICENSE" "$LIB/three/"

cat > "$LIB/SOURCES.md" <<SRC
# Vendored BIM libraries

Fetched by \`scripts/fetch-bim-libs.sh\`. Not committed — see that script.

| Library | Version | Licence | Source |
|---|---|---|---|
| web-ifc | $WEB_IFC_VERSION | MPL-2.0 | https://github.com/ThatOpen/engine_web-ifc |
| three.js | $THREE_VERSION | MIT | https://github.com/mrdoob/three.js |

Both are loaded on demand by the BIM viewer, not through Odoo's asset
bundles: a 6 MB library in \`web.assets_backend\` would be downloaded by every
user on every page whether or not they ever open a model.
SRC

echo ">> BIM libraries in $LIB"
