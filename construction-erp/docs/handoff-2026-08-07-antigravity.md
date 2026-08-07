# Handover — UX/workflow audit, Phases 1–5

**Branch:** `codex/odoo19-ui-enhancement`
**Range:** `dfef409..fa4266b` — 19 commits, 70 files, +3717/−108
**Suite:** 625 tests, 0 failed (was 553 at the start of the range)
**Stack:** Odoo 18 Community, `custom-addons/`, Python 3.11, PostgreSQL 16

Nothing in `infrastructure/` was touched, no server was accessed, and
`wip/local-2026-07-31` was not merged. Codex owns deployment.

---

## Deploy

```bash
odoo -d <db> -u construction_dashboard,construction_report,construction_rfi,\
construction_change_order,construction_defect,construction_drawing,construction_form,\
construction_boq,construction_progress_billing,construction_subcontractor,\
construction_meeting,construction_hse,construction_ui,majal_documents,\
facility_asset,facility_workorder,facility_sla \
     --stop-after-init
```

Then restart. `-u`, not a bare restart: most of this range is views, new
models and ACLs, and a restart applies none of it.

Four new models arrive with their own ACL rows — no migration, no data
backfill, nothing destructive. Every change to an existing screen hides or
reorganises; **no field was deleted anywhere in this range.**

---

## What was asked for

An audit of UI, workflow, cross-screen navigation and missing industry
features, benchmarked against Gulf/FIDIC practice, Procore/Autodesk Build,
IBM Maximo/Planon, and ISO 19650/55000/9001. The plan that came out of it ran
in five phases and all five are done.

Three constraints Mohamed set, which still govern any follow-up work:

1. **Hide, never delete.** Decluttering moves fields behind optional columns
   or collapsed sections. No migrations, no data loss.
2. **All three value axes, sequenced** — buyer-visible polish, daily-user
   efficiency, and industry feature gaps.
3. **All four benchmark standards**, not a subset.

---

## What landed

### Phase 1 — two dashboards disagreeing with themselves

`ad6ebc2` The Executive Dashboard's portfolio total re-derived forecast
margin with a cruder formula than its own rows used, so the total never
equalled the sum of the rows on any correctly-configured project.

`1f37d81` Commercial Exposure read `project.contract_value`, a plain field
nothing keeps in sync, while the Dashboard read the BOQ-derived
`cvr_contract_value`. Demo data showed the gap live: 8,400,000 vs 2,685,000
on the same project, with zero variations involved.

Both were correctness bugs wearing UI costumes.

### Phase 2 — screens that know about each other

`c85abbc` `75b4953` `052e8e8` RFI → the Change Event it raised (the RFI form
had no button box at all), Drawing → citing RFIs, Location → open work
orders, Asset → PM plans, plus the two missing "mine" filters (RFI "Waiting
on Me", Defect "Assigned to Me").

### Phase 3 — eye-friendly

`24e5dc3` `c5a3249` `c6787d9` `4896a71` `70b819a` `58bca5d` `ed443d1`
Notebook consolidation (seven construction tabs to five), `optional="hide"`
on six wide registers, the SLA clock promoted from a buried tab to a header
banner, thirteen uncoloured status badges given the palette the rest of the
suite already used, and four small consistency repairs.

### Phase 4 — views and screens that should have existed

`026d2c3` PM plan calendar (the register was list-only despite `next_date`
being calendar-shaped) and the location hierarchy in a search panel
(Community has no hierarchy view type).

`d4cd896` Tracked chatter on the asset master data — location, meter,
failure code — for ISO 55000 and QA audits.

`27df769` My Day for facilities. **This one also fixed a crash:** every
lookup on that screen reads a construction register, a facilities technician
has rights on none of them, so the approval inbox raised `AccessError` and
the entire home screen failed. Not the wrong rows — no screen.

### Phase 5 — industry gaps

`0648f5f` **Retention release.** The largest commercial hole. Every
certificate withheld retention and nothing could ever pay it out — the
claim's own invoice builder said the money "is billed later through a
retention-release certificate" and that certificate did not exist.

`b9dc882` **Advance payment and recovery.** Near universal in Gulf
contracting, previously zero files. Bills the advance, records the bank
guarantee, deducts recovery from every certificate.

`0641025` **Drawing transmittals** (ISO 19650). Issued transmittals are
immutable in what/who/why/when.

`fa4266b` **ITPs with hold points.** A hold point stops the work; a witness
point invites somebody.

---

## Design decisions worth not re-litigating

**Dates are contractual; arithmetic is not.** Releasing retention before
taking-over is flagged, logged to the chatter, and *allowed* — contracts get
varied. Releasing money never withheld is refused as an `@api.constrains`, so
an import or server action cannot route around it. Same split on advance
recovery (clamped at the advance) and on ITP hold points (waivable, but the
waiver names who authorised it). A rule that cannot express what really
happens on site gets worked around instead of used.

**No role logic in My Day.** `_sections()` already drops zero-count
registers, so a builder sees defects and RFIs and a technician sees work
orders and PMs without anything knowing which is which. Add new registers to
`_registers()`; do not add role branches.

**Config registers keep their width.** SLA policy and AI logs were left at
full column count deliberately — their columns *are* the matching criteria.

---

## Traps this range paid for

**A stored and a non-stored field must never share a compute method.** Odoo
warns that reading the non-stored one recomputes and *writes* the stored one
behind the caller's back. This was introduced in three new models before
being caught. If you add a `_compute_x` driving both, split it.

**Tracking is discarded for records created and edited in the same
transaction**, and posts on the cursor's *precommit* hook, not on flush. A
test asserting an audit trail must call `env.cr.precommit.run()` to settle
the create before the edit counts. See
`facility_asset/tests/test_facility_asset.py::test_master_data_changes_leave_an_audit_trail`.

**Drawing revisions are created `superseded` on purpose.** `construction_ui`
gates them: a revision is promoted to `current` only by
`action_make_current()` once signed off, so an unsigned drawing never
silently becomes the one site is building to. I misread this as a bug and
"fixed" it; the existing test caught me. Any test needing a *current*
revision must go through the gate — see `_publish()` in
`construction_drawing/tests/test_transmittal.py`.

**Non-stored computes cannot be searched.** Three new filters failed view
validation for this. Store the field if a register needs to filter on it,
and check its dependencies are themselves stored.

**Actions fetched by raw `orm.call` need explicit `views`.** Documented in
`docs/screens.md`; it has broken clicks three times in this codebase.

---

## Verification standard used here

Every guard in this range was proved non-vacuous by reverting the fix and
confirming the test fails:

| Guard | Tests that fail without it |
|---|---|
| Retention over-release constraint | 4 |
| Advance recovery clamp | 2 |
| Transmittal immutability | 3 |
| ITP hold-point rule | 1 |
| Asset audit trail | 1 |

Hold follow-up work to the same standard. A test that passes against the
old code is not a test.

```bash
./scripts/run-tests.sh all              # 625 tests, ~6 min
./scripts/run-tests.sh <module>         # one module
```

Local instance for visual checks:

```bash
./scripts/run-local.sh -d sidebar_demo --http-port=8201    # admin/admin
```

Playwright is preinstalled — `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`,
Chromium at `/opt/pw-browsers/chromium`. Do not run `playwright install`.
Odoo long-polls the bus, so `wait_for_load_state("networkidle")` never
fires — wait on `.o_main_navbar` instead. URLs must be
`/odoo/action-<module>.<action_xmlid>`; `/web#model=…` redirects home.

---

## Not built, and why

**ZATCA / FATOORA e-invoicing — deliberately not attempted.** It needs the
official UBL 2.1 schema, ECDSA cryptographic stamping, TLV-encoded QR, and
onboarding against ZATCA's sandbox with real credentials. Without those the
output cannot be validated, and an invoice that *looks* compliant and isn't
is worse than a known gap on a legal precondition to invoicing in Saudi.
**This needs spec and sandbox access, not more agent time.** Pull it to the
front the moment a Saudi client is real.

**EOT / delay claims.** The CPM primitives exist (`total_float`,
`baseline_start`, `is_critical` on `project.task`). Entitlement is a
forensic judgement — excusable vs concurrent vs compensable delay — and a
register that implies the analysis would mislead. Buildable as a register if
scoped honestly as one.

**Cash-flow forecast S-curve.** Skipped as lowest value: a reporting screen,
not a correctness gap. The curve model (programme-weighted vs claim-schedule)
is a choice that needs validating against a real project.

**Audit finding that was false.** Back-charges were listed as "zero files"
and are in fact complete — model, defect link, form page, ACLs, passing test.
Verify a claimed gap before building into it; this plan had two wrong
entries out of roughly thirty.

---

## Needs a human before it touches a live job

The retention and advance-recovery formulas follow standard forms but were
**not validated against a real contract.** Advance recovery is a percentage
of certified work, optionally deferred until a progress threshold, clamped at
the advance. Retention releases a percentage of what is still held. Both
deserve one review by somebody with a live IPC in front of them.

One known limit, believed correct but untested against practice: an advance
created *after* a certificate is already certified does not retroactively
deduct from it.

---

## Still open elsewhere

`docs/roadmap.md` and task #40 — two remaining forgeable-context guards in
the approval engine. Untouched by this range.
