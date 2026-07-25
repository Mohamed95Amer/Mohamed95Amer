# Vendored BIM libraries

Fetched by `scripts/fetch-bim-libs.sh`. Not committed — see that script.

| Library | Version | Licence | Source |
|---|---|---|---|
| web-ifc | 0.0.77 | MPL-2.0 | https://github.com/ThatOpen/engine_web-ifc |
| three.js | 0.170.0 | MIT | https://github.com/mrdoob/three.js |

Both are loaded on demand by the BIM viewer, not through Odoo's asset
bundles: a 6 MB library in `web.assets_backend` would be downloaded by every
user on every page whether or not they ever open a model.
