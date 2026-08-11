# Majal continuation handoff

> **Newest checkpoint: [`next-tool-2026-08-11/START_HERE.md`](next-tool-2026-08-11/START_HERE.md)**
> — the Property suite, and one open UI defect that needs a browser to fix.
> The 2026-07-31 checkpoint below remains the reference for the Construction
> and Facilities platform.

Use this folder to continue the Majal work with Codex, Claude Code, Cursor, or
another coding tool.

> **Latest checkpoint:** start with
> [`next-tool-2026-07-31/START_HERE.md`](next-tool-2026-07-31/START_HERE.md)
> and give the next tool the contents of
> [`next-tool-2026-07-31/COPY_THIS_PROMPT.txt`](next-tool-2026-07-31/COPY_THIS_PROMPT.txt).
> Those files include the UI, Arabic, dashboard, material-access and
> company-switcher work completed after the older checkpoint below.

## Where the project is

- Repository:
  `C:\Users\hossi\Documents\Odoo\construction-erp`
- Git branch:
  `codex/odoo19-ui-enhancement`
- Live local URL:
  `http://127.0.0.1:8069`
- Live database:
  `erp`
- Docker Desktop executable:
  `C:\Users\hossi\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe`

The current implementation remains local and is intentionally **not pushed**
while the remaining physical-device, offline and product-readiness gates are
open. Review `git status` before changing it, and do not reset, checkout,
clean, discard or overwrite local work.

Start by giving the next tool the entire contents of
[`PROMPT_FOR_NEXT_TOOL.txt`](PROMPT_FOR_NEXT_TOOL.txt).

## What was created in this continuation

### New modules

- `custom-addons/majal_documents`
  - client legal/document identity;
  - English/Arabic sanitized rich-text templates;
  - immutable revisions and SHA-256 checksums;
  - named approver and separation of duties;
  - internal sign-off bound to the exact revision;
  - PDF report;
  - structured BOQ/estimate/budget/valuation sheets;
  - safe CSV export;
  - secure override for the OCA DMS directory-token bug.
- `custom-addons/majal_field_offline`
  - dedicated `/majal/field/` mobile field workspace;
  - IndexedDB and per-user service-worker cache;
  - duplicate-safe UUID synchronization;
  - visible `write_date` conflicts;
  - offline defects, daily logs, inspection answers, work-order checklists,
    notes, asset scans and selected drawing PDFs;
  - approvals, finance, stock, deletes, external sending and BIM remain
    online-only.
- `custom-addons/majal_demo`
  - opt-in two-company acceptance dataset;
  - nine role personas;
  - projects, BOQ, tasks, RFIs, defects, inspection, drawings, daily logs,
    facility hierarchy, assets, work orders, documents and sheets;
  - demo password: `MajalDemo!2026`;
  - never install this module in production.

### Security and recovery work

- strict Majal role allowlists remove dangerous legacy groups;
- company-admin actions are scoped to the current client company;
- model-level last Platform Owner protection covers demotion, group removal,
  deactivation and deletion;
- project/company/facility-assignment record-rule foundation;
- approval requests and steps are protected evidence;
- shared approvable models reject direct state writes;
- named project-document/drawing approvers and separation of duties;
- audit actor is captured before narrow `sudo`;
- restore requests now use per-request markers, cancellation invalidation,
  expiry, live DB request validation, an atomic running marker and receipts;
- facility portal equipment choices are company-filtered;
- client legal company name is no longer overwritten with the Majal product
  name.

### Documentation

- `docs/full-system-audit-2026-07-28.md`
- `docs/documents-and-offline.md`
- README and getting-started additions
- Arabic catalogs for the two new user-facing modules

## Current validation status

Passed on 2026-07-29:

- Python compilation of the edited/new Python files;
- XML well-formedness for the edited/new XML files;
- JavaScript syntax check for the offline application.
- clean installation of 137 modules on `majal_ci_20260728`;
- final clean full custom suite: 482 tests, 0 failures, 0 errors on
  `majal_full_20260729_2`;
- corrected clean-install retest with no Odoo error markers;
- focused post-correction suite: 14 tests, 0 failures, 0 errors;
- upgrade of database and filestore clone `majal_upgrade_20260729`, including
  Arabic translations and installation of Documents/Offline;
- phone-sized browser acceptance for app scrolling, Construction, Facilities,
  BIM, Documents and Majal Field;
- destructive backup/restore drill on the disposable clone, including safe
  rollback from an induced PostgreSQL compatibility failure, successful
  database and 777-file filestore restore, and receipt/audit reconciliation;
- focused recovery regression: 0 failures and 0 errors.
- facilities technician/manager CRUD separation: 44 focused tests, 0
  failures and 0 errors.
- 12 controlled Procurement, Inventory, Finance, HR, Website and AI
  capability tiers; focused Administration result 22 module tests / 20 Odoo
  aggregate tests, 0 failures and 0 errors;
- client-admin role/capability picker filtering, one-time password clearing
  and clone-only user creation;
- full Capability Catalog/access-dialog visual acceptance on the isolated
  clone;
- Arabic installation plus RTL visual acceptance of Administration
  navigation, headings, all 12 catalog rows and their descriptions.

Not yet passed:

- true server-unavailable and physical-device offline acceptance;
- physical QR/NFC and representative remote-device BIM/WebGL acceptance;
- external security, deployment, legal and commercial production gates.

The isolated databases `majal_ci_20260728` and `majal_upgrade_20260729` exist
and are owned by `majal_app`. The live `erp` database was not modified by
these validation runs. See `docs/validation-2026-07-29.md`.

## Safe continuation order

1. Run `git status --short` and preserve every current modification and local
   checkpoint.
2. Re-run Python/XML/JavaScript static checks.
3. Recreate only the isolated database `majal_ci_20260728`.
4. Run a clean install with `--http-port=8079` and capture exit code/stdout.
5. Fix install errors one at a time. The likely first review areas are:
   - dynamic tenant-rule relation paths in
     `majal_administration/models/tenant_security.py`;
   - Odoo view/domain validation in `majal_documents`;
   - field names and workflow values used by `majal_demo/hooks.py`;
   - offline controller/model field names.
6. Run all custom module tests, including the new document/offline tests.
7. Add/finish adversarial tests for every audit blocker.
8. Run a cloned-database upgrade. Do not upgrade live `erp` first.
9. Manually test airplane mode, QR/NFC and BIM/WebGL on supported physical
   hardware; retain the completed English/Arabic and 390 px browser evidence.
10. Update the audit report with actual pass/fail evidence.
11. Only after all release gates pass: install/upgrade live, smoke-test, commit,
    push and create the final preview/deployment.

## Important remaining product work

- Finish facility CRUD ACL separation, not only record assignment domains.
- Expand the demo/acceptance matrix to every important construction and FM
  workflow, including negative cross-company cases.
- Complete Arabic translation of JavaScript-generated offline messages.
- Decide whether to integrate a supported full Office co-editor. The current
  structured editor is safe but is not arbitrary DOCX/XLSX round-trip editing.
- Integrate a TDRA-listed trust-service provider when qualified UAE electronic
  signatures are required. The current approval mark is intentionally not
  described as a qualified signature.
- Production backups need encrypted off-machine replication and a real restore
  drill. Live database + filestore capture is not a storage-level atomic
  snapshot.
- Run external penetration testing, dependency/container scanning, TLS,
  monitoring, mail authentication and secrets management before selling.

## Never do these while continuing

- Do not run `git reset --hard`, `git checkout -- .`, `git clean`, or delete the
  working tree.
- Do not drop, recreate or experiment on the `erp` database.
- Do not install `majal_demo` in a production/client database.
- Do not claim the suite passed until the clean install and logs prove it.
- Do not claim internal image/checksum approval is a qualified legal signature.
- Do not expose the local Windows/Docker database as a permanent client demo.
