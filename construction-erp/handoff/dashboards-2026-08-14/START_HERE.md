# Handover — dashboards, depreciation, security guards (2026-08-14)

Branch `codex/odoo19-ui-enhancement`, PR #7. Everything below is pushed.
Baseline is **704 tests, 0 failed, 0 errors** (`scripts/run-tests.sh all`).
It was 627 at the start of this session.

---

## Read this first: install-time success proves almost nothing

Three separate features in this session installed perfectly and did not
work. Each was found only by driving a browser:

- A MIS expression that loaded fine and raised `Invalid field
  account.account.account_id` the first time a user opened the report.
- The drawing revision compare opening with **both panes blank**, because
  `renderBoth` ran in `onWillStart` before the component mounted, so the
  canvas refs were still null. Any control the user touched fixed it — so it
  looked like slowness, not a bug.
- The Financial Reports menu opening on an **empty list**, because a
  `mis.report` definition was shipped without a `mis.report.instance`.

**`scripts/run-tests.sh` was green through all three.** If you touch UI,
JS, or anything a user opens, drive it in a browser before calling it done.

There is a working harness to copy: `handoff/dashboards-2026-08-14/`
references the scripts used. Pattern that works —

```python
browser = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium")
page.wait_for_selector(".o_main_navbar", timeout=90000)   # never networkidle
page.on("pageerror", lambda e: errs.append(str(e)))       # silent JS errors
```

`wait_for_load_state("networkidle")` never fires — the bus long-polls.

---

## The other repeated mistake: I assumed APIs instead of reading them

Six defects came from writing what I expected a field to be called. Query
the schema or read the model **first**. Real examples from this session:

| I wrote | It actually is |
|---|---|
| `subcontract.partner_id` | `subcontractor_id` |
| `boq.line.unit_cost` (writable) | computed from `cost_material` + `cost_labour` + `cost_equipment` |
| claim line `percent_complete` | `qty_this_period` |
| subcontract `state='active'` | `draft` / `confirmed` / `closed` |
| `('account_id.account_type', …)` in MIS | `('account_type', …)` — the domain selects accounts, not journal items |
| `.po` entries with just msgid/msgstr | need `#. module: x` **and** a `#:` occurrence line, or the install dies |

```bash
psql -d <db> -tAc "select column_name from information_schema.columns
                    where table_name='construction_subcontract';"
```

---

## What was built

### 1. Security — four forgeable context guards (`5072766`)

The task said two; there were four. All accepted **any truthy value** under
their context key, so an RPC caller with ordinary write access could send
`majal_document_transition: true` and write `state`, `approved_by_id`,
`approval_checksum`, or promote an unsigned drawing to current.

Now compare against a private object by identity, the pattern already in
`construction_base/models/approval_mixin.py`:

- `majal_documents/models/transitions.py` — `DOCUMENT_TRANSITION`, `SHEET_TRANSITION`
- `construction_ui/models/transitions.py` — `PROJECT_DOCUMENT_TRANSITION`, `DRAWING_TRANSITION`

Separate sentinels per guard, so a reference escaping one workflow cannot
open another. 13 tests fire seven forgery shapes at each.

**If you add a workflow guard, use this pattern. Never a truthy check.**

### 2. Depreciation — now actually depreciates (`26fa07a`)

The earlier version created the asset and stopped.
`account.asset.asset.create()` computes the board, but the asset stays in
`draft`, and `_cron_generate_entries` only reads `state='open'`. Nothing ever
reached the ledger — worse than no depreciation, because it reads as done.
It now calls `validate()`.

Also added because the number is otherwise untrustworthy:
`asset_in_service_date` (depreciation runs from commissioning, not data
entry), `asset_salvage_value` (zero salvage overstates the annual charge for
the asset's whole life), and a disposal flag + button.

**Disposal is deliberately not automatic.** Closing an asset posts a
disposal entry, and an accounting entry appearing because somebody changed a
status on a *maintenance* form is how a finance team stops trusting the
system.

`facility_asset` now depends on `om_account_asset`, so accounting installs
wherever FM does.

### 3. Gantt phases from WBS (`26fa07a`)

Nothing populates `parent_id` — demo data included — while every task carries
a code like `1.1`. So phases are **synthesised** from the numbering: a
summary row spanning its descendants, carrying their worst slip and tightest
float. Not a task: string id, cannot be opened, clicking folds it.

Progress is **duration-weighted**. A phase holding a two-day task at 100%
and a sixty-day task at 0% is not half done.

Also fixed: the server orders `wbs_code` as a string, putting `10.1` before
`2.1`. Wrong on any programme reaching ten of anything.

### 4. Eight dashboards + four SQL analysis views (`fe67134`, `8eb9f1f`)

Module `custom-addons/majal_dashboard/`.

**Why SQL views at all:** the headline numbers — contract value, cost to
date, earned and forecast margin — are computed fields with `store=False`,
and Odoo cannot group or sum an unstored field. The figures management most
wants were exactly the ones no chart could show. That gap had to close
whatever draws the charts.

Views: `majal.construction.report` (one row per project, restates CVR),
`majal.facility.report`, `majal.estate.report`, `majal.procurement.report`
(unions purchase-order lines **and** subcontract lines, because a job's
commitment is the sum of both).

**`test_construction_report.py` pins the SQL to the Python CVR field by
field.** Keep it. It has already caught:
- a `JOIN res_company` that should have been `LEFT JOIN` —
  `project_project.company_id` is nullable, so an inner join silently dropped
  projects from an executive margin total;
- that a comparison-only test can agree with itself and measure nothing
  (`budget_cost` read zero on both sides and passed). **Assert concrete
  numbers as well as agreement.**

Boards are functional, not by business line: Executive, Financial,
Operations, Project, Procurement, Workforce, HSE, Equipment. A finance
director asks about money across all three businesses, not about
construction.

Panels are `<action name="%(xmlid)d" view_mode="graph"/>` inside
`<column>` inside `<board>`. **Must be a window action** — a server action
cannot be rendered in a board.

### 5. MIS Builder + OCA spreadsheet (`a96a7ff`, `4140c17`)

MIS Builder was already vendored and never installed. Ships a
**Trading Summary** selecting by **account type, not account code** — a
report written against codes is right on exactly one chart of accounts and
silently wrong on every other.

OCA/spreadsheet vendored at `6663df2` (`spreadsheet_oca`,
`spreadsheet_dashboard_oca`, `spreadsheet_dashboard_purchase_oca`). Odoo
core displays dashboards but cannot edit them; editing is Enterprise's
`spreadsheet_edition`. Verified in a browser: the o-spreadsheet grid,
topbar and toolbar all render.

**Dashboard Ninja was declined** — Odoo Proprietary License v1.0, paid.
Vendoring a proprietary dependency into a product that is sold is the
owner's decision, not a technical one.

Vendoring broke the branding test (`spreadsheet_oca` arrives as its own app
with its own icon). It was **rebranded**, not added to the allow-list — the
rule is that no app shows a stock icon, and widening the exception retires
the check that caught it.

Both MIS data files are `noupdate="1"`: a finance team will edit these and
an upgrade must not discard their work. Cost: later template fixes will not
reach an installed database without a manual step.

---

## Open work

1. **Procurement panels are thin** — few purchase orders in demo. The view
   is correct; the data is not there. `purchase.order.construction_project_id`
   already links POs to projects and routes receipts to the site store.
2. **Workforce has 2 panels.** Needs a stored utilisation measure to answer
   "who is over-committed" — probably a fifth analysis view over
   `majal.allocation`.
3. **MIS report not yet on the Financial board** — it is reachable from its
   own menu. Board panels need a window action; check whether MIS's action
   renders inside a board before wiring it.
4. **Demo data leaves two good features looking empty**: no parent tasks in
   `construction_planning/demo/planning_demo.xml` (Gantt tree — though
   synthesis now covers this), and no PDFs on demo drawing revisions
   (revision compare shows two blank panes). Both work; both look bare on a
   fresh install. Deliberately not changed — what the demo should *show* is
   a product decision.
5. **RTL is unverified.** Three directional glyphs were flipped for RTL
   (back arrow, sidebar chevron, Gantt twisty) and never looked at in
   Arabic. The database installs with `--load-language=ar_001`.
6. **Non-admin personas unverified** on the new screens. A record-rule fault
   invisible to admin has bitten this branch before (My Day).

---

## Verifying

```bash
scripts/run-tests.sh all          # 704 tests, must stay 0/0
scripts/init-db.sh <db>           # CI-equivalent install, loads ar_001
scripts/run-local.sh -d <db> --http-port=8069
```

**Run `init-db.sh`, not only the suite.** The suite never loads a language;
`init-db.sh` does, and a malformed `.po` entry took the whole install down in
this session while the suite stayed green.

Odoo's `shell` needs the bare binary, not the wrapper:

```bash
python3 vendor/odoo/odoo-bin shell -c vendor/odoo-local.conf -d <db> --no-http < script.py
```
