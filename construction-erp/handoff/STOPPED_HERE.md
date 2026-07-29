# Majal exact stopping point

Last updated: 2026-07-29

## Current state

- Project folder: `C:\Users\hossi\Documents\Odoo\construction-erp`
- Branch: `codex/odoo19-ui-enhancement`
- Live URL: `http://127.0.0.1:8069`
- Live database: `erp`
- The live database was intentionally left untouched.
- Preserve the current branch and review `git status` before changing it. Do
  not reset, clean, checkout, or discard local work.

## What was completed

- A broad multi-role security and product-readiness audit.
- Initial security hardening for roles, tenancy, approvals, workflows, portal
  access, audit records, backup requests, and restore authorization.
- New `majal_documents` module for company-branded controlled documents,
  versions, approvals, PDF output, and structured sheets.
- New `majal_field_offline` mobile PWA for a deliberately limited set of safe
  offline field actions.
- New opt-in `majal_demo` dataset with construction, facilities, documents,
  users, and role personas.
- Static Python, XML, and JavaScript checks passed at the stopping point.
- Documentation and test scripts were updated.

## Exact current checkpoint

- A clean install of 137 modules, including `majal_demo`, completed on
  `majal_ci_20260728` using port 8079.
- The final clean full custom suite completed with 482 tests, 0 failures and
  0 errors on disposable database `majal_full_20260729_2`.
- Non-fatal log review then found and corrected legacy demo passwords, secure
  asset-token migration order, and an obsolete field parameter.
- The corrected clean install completed with no Odoo error markers.
- Focused post-correction regression completed with 14 tests, 0 failures and
  0 errors.
- A database and filestore clone of live `erp` was created as
  `majal_upgrade_20260729`.
- The first clone upgrade found malformed metadata in the two new Arabic PO
  catalogs. Both catalogs were corrected.
- A fresh restore of that clone then upgraded all installed Majal modules and
  installed Documents/Offline successfully with no Odoo error markers.
- Phone-sized browser acceptance passed for app-menu scrolling, Construction,
  Facilities, BIM full rendering, BIM Safe View, Documents and Majal Field.
- The field pack synchronized successfully. The final server-unavailable
  reload could not be observed because the browser harness blocked the
  resulting network-error page.
- A real backup/restore drill completed on disposable clone
  `majal_upgrade_20260729` using an isolated backup root. An initial
  PostgreSQL client/server compatibility failure rolled back safely; the
  executor was hardened, the rerun restored the database and 777-file
  filestore, and the completion receipt reconciled into immutable audit entry
  20.
- Focused post-restore `majal_administration` regression completed with 0
  failures and 0 errors.
- Facilities CRUD was tightened so technicians retain assigned work, reading,
  pin, checklist and planned-part updates but cannot delete operational
  evidence or change meter/floorplan masters. The focused four-module run
  passed all 44 tests; managers retained explicit destructive authority.
- A database-selector route test was made configuration-independent after the
  generic test profile exposed a correct-redirect loop. Focused branding and
  the integrated rerun passed.
- Twelve optional capability tiers now cover Procurement, Inventory, Finance,
  HR, Website and AI Administration. Role minimums, one tier per family,
  Platform Owner approval for high-risk tiers, strict removal and audit
  evidence are enforced. HR no longer implies Facilities Administration.
- The focused capability suite passes with 22 module tests / 20 Odoo
  aggregate tests. It includes regression coverage for client-admin role and
  capability filtering and for securely clearing the one-time invitation
  password.
- Final visual capability acceptance passed in the Codex in-app browser
  against the isolated clone. The 12-row catalog, Company Administrator
  picker boundaries, Field User capability boundaries, clone-only user
  creation and Change Access dialog were verified.
- Arabic was installed through the standard language installer on the clone.
  The Administration PO catalog was refreshed with exact Odoo references and
  the final isolated Arabic session rendered the capability navigation,
  headings, all 12 rows and their descriptions in RTL Arabic.
- The final 482-test integrated clean run passed after those corrections.
- The source `erp` database was only read and remains unmodified.

Evidence is recorded in `docs/validation-2026-07-29.md`.

Physical-device/offline acceptance, external security testing and production
deployment work remain. Do not describe the build as fully accepted or
sell-ready yet.

## First action when resuming

1. Run `git status --short` and preserve every existing change.
2. Read `handoff/README.md`, this file and
   `docs/validation-2026-07-29.md`.
3. Complete the remaining physical-device offline, QR/NFC, BIM/WebGL,
   document/PDF and client-key AI acceptance.
4. Expand adversarial cross-company tests and the remaining facility models.
5. Update the audit with all manual evidence and remaining exceptions.
6. Only after the gates pass, upgrade live `erp`, smoke-test it and push.

## Important review targets

- Dynamic project/facility record-rule installation.
- Cross-company isolation and facility CRUD permissions.
- Approval evidence immutability and separation of duties.
- Restore request ID, token, expiry, state, receipt, and filestore consistency.
- Offline idempotency, conflict handling, per-user cache clearing, and strict
  prohibition of offline approvals, signatures, finance, stock, deletes, and
  BIM changes.
- Document checksum/version integrity and safe placeholder rendering.
- Demo hooks, installation/uninstallation behavior, and production exclusion.
- Recheck capability-pack mappings whenever upstream business modules or
  implied security groups change.

This file is the canonical checkpoint for the next review.
