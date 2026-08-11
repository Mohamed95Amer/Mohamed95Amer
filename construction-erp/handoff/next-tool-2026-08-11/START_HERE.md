# Majal Property — start here (updated 2026-08-11)

## Current state

The Property suite is enabled and the automated pre-Hetzner gate is green.
`majal_property_ui` is installable and its backend asset bundles build. The old
blank-client/quarantined-UI report in this handoff is superseded.

Read first:

1. `docs/pre-hetzner-release-audit-2026-08-11.md`
2. `docs/api/index.md`
3. this folder's `CHECKPOINT.md`

## Locations

| Item | Value |
| --- | --- |
| Worktree | `C:\Users\hossi\Documents\Odoo-majal-property\construction-erp` |
| Branch | `feature/majal-property-phase2` |
| Current committed head | `246f934` |
| Remote head before this audit | `15b0400` |
| Current state | Head plus uncommitted audit fixes/docs; review before commit |
| Local demo | `http://localhost:8074`, database `majal_demo`, `admin/admin` |
| Demo containers | `majal-prop-web`, `majal-prop-db` |

Never touch `C:\Users\hossi\Documents\Odoo` or database `erp` while working on
Property. They are the separate live Majal working copy and database.

## Verified

- Fresh full-suite install: **843 tests, 0 failed, 0 errors**.
- 48 requested Majal modules installed; 141 total modules with dependencies.
- Upgrade from platform commit `0a021cb`: exit 0.
- Upgrade-targeted Property tests: 199 green.
- Affected-module regression after fixes: 362 green.
- Multi-company Property isolation: permanent regression green.
- Authenticated HTTP/JSON-RPC smoke: green.
- API route inventory: 30 declarations / 11 files.

## What changed but is not committed yet

- Property company rules across 28 business models plus regression tests.
- Five upgrade-safe demo data files.
- Duplicate-label, icon-title and deprecated-aggregation cleanup.
- Property/API/integration/health documentation.
- This refreshed handoff and release audit.

## Remaining release gate

Only manual/browser and deployment-environment checks remain: visual desktop and
mobile UAT, WebGL BIM smoke, provider sandbox contracts, and a Hetzner-like
backup/restore rehearsal. Nothing was pushed or deployed during this audit.
