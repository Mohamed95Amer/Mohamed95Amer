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
LIB="${BIM_LIB_DIR:-$HERE/custom-addons/construction_bim/static/lib}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$LIB/web-ifc" "$LIB/three"

# Tarballs come straight from the registry over HTTPS rather than through npm.
# The Codespaces base image has no Node, and needing a JavaScript package
# manager to download two files would make the 3D viewer unavailable there for
# no reason. npm is used only if curl is missing.
fetch() {
    local name="$1" version="$2" out="$3"
    local url="https://registry.npmjs.org/$name/-/$name-$version.tgz"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$out"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$out" "$url"
    elif command -v npm >/dev/null 2>&1; then
        npm pack "$name@$version" --pack-destination "$(dirname "$out")" >/dev/null
        mv "$(dirname "$out")/$name-$version.tgz" "$out"
    else
        echo "need curl, wget or npm to fetch $name" >&2
        exit 1
    fi
}

echo "==> web-ifc $WEB_IFC_VERSION"
fetch web-ifc "$WEB_IFC_VERSION" "$TMP/web-ifc.tgz"
tar xzf "$TMP/web-ifc.tgz" -C "$TMP"
cp "$TMP/package/web-ifc-api-iife.js" "$LIB/web-ifc/"
cp "$TMP/package/web-ifc.wasm" "$LIB/web-ifc/"
cp "$TMP/package/LICENSE.md" "$LIB/web-ifc/"
rm -rf "$TMP/package"

echo "==> three $THREE_VERSION"
fetch three "$THREE_VERSION" "$TMP/three.tgz"
tar xzf "$TMP/three.tgz" -C "$TMP"
cp "$TMP/package/build/three.module.min.js" "$LIB/three/"
cp "$TMP/package/LICENSE" "$LIB/three/"
rm -rf "$TMP/package"

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
