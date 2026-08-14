# Majal — UX pass from Mohamed's testing round (13 August 2026)

Mohamed tested the running system and produced 23 change requests, plus one
website copy rewrite. Most are navigation and naming problems: features that
already exist but are not where a user looks for them. A few are genuinely
missing capability.

This brief records what was established by reading the codebase, so the next
tool does not re-derive it, and flags the traps that break the build if hit
blind.

## What this was validated against

Branch `codex/odoo19-ui-enhancement`, commit `081d756`. Every file path and
line number below was checked against that tree.

**Two scope notes, stated plainly rather than guessed at:**

- There are **no property-management modules** in `construction-erp/custom-addons/`
  on this branch — 38 modules, none of them property. If property work lives in
  the `_property_visual` worktree, nothing in this brief covers it.
- There is **no `infrastructure/` directory** in this checkout. If it exists
  locally it is unpushed, and nothing here touches it.

Re-check both before assuming this brief is complete for your worktree.

---

## Before you start

- Run `git status --short` and `git log --oneline -10` first. Do not reset, clean, stash-drop, force-push or discard existing work, and do not touch unrelated dirty files.
- Branch off `codex/odoo19-ui-enhancement` onto a new `codex/` branch for this work.
- **Tests:** `scripts/run-tests.sh`. Baseline is **627 tests, 0 failed, 0 errors** — it must still be that at the end of every phase.
- **Running app:** `scripts/run-local.sh`. Postgres prints a misleading `did not start in time…fail!` and then comes up seconds later — poll for readiness rather than trusting that message.
- **Driving the UI:** action URLs are `/odoo/action-<module>.<xmlid>`. Wait on `.o_main_navbar`; never `wait_for_load_state("networkidle")` — the bus long-polls and it never fires.
- **One commit per phase**, suite green before the next starts. Phases are ordered so the cheap, visible work lands first.
- The brand is **Majal**, not Odoo. Preserve Majal terminology, colours, icons, Arabic/English support, RTL behaviour and responsive layouts.

---

## Read this first: five requests describe UI that does not exist

Taking these at face value sends you hunting for things that are not there.

| Request as written | What is actually true |
|---|---|
| "make the drawings tab before the assets tab" | Not the project form. This is the **Majal Field** app nav, which runs Overview / Defects / Inspections / Work Orders / **Assets / Drawings** — `majal_field_offline/views/field_app_templates.xml:36-41`. A two-line swap. |
| "remove plan viewer tab" | There is no Plan Viewer tab anywhere. It is a sidebar menu, a workspace-hub card, and two buttons on the drawing form. **Decision: remove the menu and the card, keep the buttons.** |
| "revisions and sign offs should be in drawings tab as a smart button" | Sign-off already exists — `approval_state`, `approved_by_id`, approve/reject methods on drawing revisions in `construction_ui/models/project_workspace.py:282+`, plus a "Revisions & Sign-off" menu already defined. It only needs surfacing. |
| "make the bulk upload drawings inside the drawings tab as a feature" | Already built. `construction.drawing.upload` in `construction_drawing/wizard/drawing_upload.py` parses `AR-101_B.pdf` → number/revision and splits multi-page PDFs into one revision per page. Surface it; do not rebuild it. |
| "the material tab need to be well organized… name the materials, add their counts, costs" | `construction_material` is already five models deep — issues, lines, and a Postgres-view "material position" carrying budget/consumed/waste/variance/on-hand. There is simply **no project tab** for any of it. Discoverability, not capability. |

Decisions already taken with Mohamed: Plan Viewer → menu and hub card go, drawing
buttons stay. Change Event → renamed **Change Order**, with variations as inline
lines carrying a Reason column. Asset depreciation → **full accounting
integration**. Multi-approver → several named people per approval step.

---

## Phase 1 — The bug, then navigation and naming

### 1.1 "Documents & Commercial is not working" — reproduce before fixing

The action is structurally sound: `action_majal_project_documents`
(`construction_ui/views/project_workspace_views.xml:146`) targets
`majal.project.document`, and the `search_default_group_project` filter it asks
for exists at line 139 of the same file. ACLs exist for both the user and
manager groups. So this is a **runtime** failure, not a broken definition.

**Leading hypothesis:** `majal.project.document` is in the tenant record-rule map
(`majal_administration/models/tenant_security.py:8`). That is the same machinery
that crashed My Day earlier on this branch, where a malformed match-nothing
domain `[(1,'=',0)]` fell through Odoo's `expression.is_boolean()` and blew up on
`left.split('.')` inside `_apply_ir_rules`. That instance was fixed, but this
action must be exercised as a **non-admin, industry-scoped persona** to confirm
nothing similar remains.

Steps: bring up the demo DB, log in as a seeded non-admin persona, open
Commercial → Documents & Commercial, capture the real traceback, fix at the root,
and add a regression test alongside
`majal_administration/tests/test_administration.py`. **Prove the test fails
against the unfixed code** — a test that passes before the fix is not a test.

### 1.2 Majal Field: Drawings before Assets
`majal_field_offline/views/field_app_templates.xml:36-41` — swap the two nav
buttons. Check `static/src/js/field_app.js` for any order assumption in its view
registry.

### 1.3 Project status in the header
`construction_stage` (tender / mobilization / execution / handover / dlp /
closed — `construction_base/models/project_project.py:14`) is currently a badge
buried in the Project Profile tab (`construction_base/views/project_views.xml:13`).
Move it into `<header>` as a statusbar beside the project name, through the
existing `construction_ui.view_project_form_majal_360` inherit. Leave core's
`stage_id` statusbar alone — it is group-gated and mostly invisible anyway.

### 1.4 Plan Viewer: stop being a nav destination
Remove:
- menu `construction_pin.menu_plan_viewer` (`construction_pin/views/plan_viewer_action.xml`)
- the `plan_viewer` workspace card (`construction_ui/static/src/workspace_hub/workspace_hub.js:514`), its facet block (line 259), and the six `related: [… "plan_viewer" …]` cross-links at lines 372, 403, 553, 568, 583, 598

**Keep** `construction_pin.action_plan_viewer` and both drawing-form buttons
(`construction_pin/views/drawing_views.xml:10` and `:16`).

> **Trap.** The action is hard-`ref`'d at
> `construction_ui/views/workspace_hub_views.xml:204`, and the whole
> `facility_floorplan` module reuses the same `construction_plan_viewer`
> client-action tag. Deleting the action fails module load and kills FM
> floorplans.

### 1.5 Hide WhatsApp
- `construction_whatsapp/views/whatsapp_menus.xml:3-5` — add `groups="base.group_system"` to `menu_whatsapp_messages`. The two config menus already carry exactly this.
- Remove the `whatsapp` workspace card (`workspace_hub.js:735`) and the menu re-point (`construction_ui/views/workspace_hub_views.xml:283-285`).
- Set both crons inactive in `construction_whatsapp/data/whatsapp_cron.xml`.

> **Trap.** Do not uninstall the module. `construction_ui/__manifest__.py:40`
> lists `construction_whatsapp` as a hard dependency, and it is named explicitly
> in five install scripts and docs. The six hooks in `models/notifications.py`
> keep queueing rows; with the crons off nothing reaches Meta.

### 1.6 Meetings → quick access, not a top-level menu
Remove `menu_meeting_root` (`construction_meeting/views/meeting_menus.xml`) and
add a Meetings stat button to the project button box.
`construction.meeting.project_id` already exists (`models/meeting.py:184`).

### 1.7 Subcontracts and payments as project quick access
- Stat buttons for Subcontracts and Payments on the project form.
- Rename the "Subcontractor Payments" action and menu to **Payments**, and add a Payments smart button on the subcontract form — `construction_subcontractor/views/subcontract_views.xml:223-233`.

### 1.8 Materials on the project
Add a **Materials** tab surfacing what already hangs off `project.project` in
`construction_material/models/project_material.py`: `material_summary_ids`,
`material_issue_ids`, and the computed `material_budget_value`,
`material_consumed_value`, `material_waste_value`, `material_waste_percent`,
`material_over_budget_count`. Reuse the existing `action_open_material_summary()`
and `action_open_site_stock()`.

### 1.9 Drawings: bulk upload and revisions as buttons
Surface `construction_drawing.action_drawing_upload` and
`construction_ui.action_majal_drawing_revisions` as buttons in the Engineering
tab's Drawings block — `construction_ui/views/project_workspace_views.xml:306-316`.

### 1.10 Follow the existing stat-button convention
Every button above: `oe_stat_button` in the button box → `action_*` object method
→ `_majal_open_records(model, name)`
(`construction_ui/models/project_workspace.py:235-269`), with the count added to
`_compute_majal_workspace_counts` (same file, 206-233). There are 48 existing
examples across 28 files — match them rather than inventing a pattern.

---

## Phase 2 — Model and data changes

### 2.1 Change Event → Change Order, variations as lines
Current structure: `construction.change.event` (prefix CE) holds a one2many of
**full** `construction.change.order` documents (prefix VO), each with its own
approval workflow, its own BOQ apply, and its own `reason` Html field —
`construction_change_order/models/change_order.py:8`, `:71`, `:92`.

Do:
- Relabel `construction.change.event` → **Change Order**.
- Relabel `construction.change.order` → **Variation**, to clear the collision the rename creates.
- The parent form has **no** `change_order_ids` field today, only a disabled stat button (`views/change_order_views.xml:19-23`). Add it as an inline editable list with **Reason** as a visible column, and add `reason` to `view_change_order_list` (line 158).

> **Do not rename the model `_name`s.** That means a data migration plus an edit
> to `majal_administration/models/tenant_security.py:17`. Labels are what the
> user sees; identifiers stay.

Rename surface: Python `_description`s, the action, the menu, the search view
(`construction_ui/views/register_search_views.xml:143-145`), workspace-hub copy
(`workspace_hub.js:643`), `construction_rfi` labels and
`action_raise_change_event`, the docs, and **62 Arabic entries** in
`construction_change_order/i18n/ar_001.po` plus cross-references in six other
modules' `.po` files.

### 2.2 Defect: reviewer, and a work order on assignment
- `construction.defect` has `assigned_user_id` and `ball_in_court_id` but **no reviewer** — add `reviewer_id` (`construction_defect/models/construction_defect.py`).
- **No defect↔work-order link exists anywhere in the codebase.** Add `workorder_id` → `maintenance.request` (the model `facility_workorder` extends) and create one for the assignee on defect creation. Follow the creation pattern in `facility_workorder/models/pm_plan.py:48-65`.

### 2.3 Majal Field: assignee, reviewer, photo
The new-defect form (`field_app_templates.xml:97-121`) captures only project,
name, location, severity and description.

**The backend already accepts a photo** — `offline_operation.py:126` decodes
`photo_before` with a ~6 MB cap via `_decode_photo` (line 98). So the camera
input is a front-end change only. Add the two new fields to the allow-list in
`_apply_defect_create` (line 113); note it currently force-sets
`assigned_user_id` to the submitting user, which must change now that assignee
becomes a real input.

### 2.4 Multi-person approval
`construction.approval.rule.step` currently offers `group_id` ("Any Member Of")
**or** `user_id` ("Specific Person") — one named person only
(`construction_base/models/approval_rule.py:129-135`).

Add `user_ids` (Many2many) meaning *any of these named people can sign*, which is
consistent with how `group_id` already behaves, and mirror it on
`construction.approval.step` (`approval_request.py:192-193`). Keep `user_id`
working. Document in the docstring that *all must sign* is expressed by adding
several steps, not by this field.

### 2.5 Bulk request-for-approval
`action_request_approval` (`construction_base/models/approval_mixin.py:162`)
**already loops over `self`** — it just has no multi-record entry point. Add a
list-view bound action mirroring `action_approval_decision`
(`construction_base/views/approval_views.xml:38-45`), which already does exactly
this for the decide side and reads `active_ids` in `default_get`.

Fix the batch behaviour while you are there: today it raises `UserError` on the
first record that is already pending or uncovered, aborting the entire selection.
Skip and report instead.

### 2.6 Asset depreciation — full accounting integration
`facility_asset` extends `maintenance.equipment` and has only `purchase_value`
and `expected_life_years` as inert fields
(`models/maintenance_equipment.py:43-46`). A repo-wide search for
`depreciat|useful_life|salvage|residual` returns **zero hits**.

`om_account_asset` is already vendored and installed transitively through
`om_account_accountant` (pinned in `third-party-repos.yml`), providing
`account.asset.asset` with linear/degressive methods, `depreciation_line_ids`,
categories and a confirmation wizard — with **no** link to
`maintenance.equipment`.

Add the dependency, an `asset_id` link on the equipment, a category default, and
an action generating the schedule from `purchase_value` + `expected_life_years`.
Surface book value and accumulated depreciation on the asset form.

> **Trap.** This pulls the accounting stack into the FM install path. Before
> merging, confirm `om_account_accountant` is present in every install list that
> installs `facility_asset` — `scripts/init-db.sh`, `scripts/run-tests.sh` and
> the CI workflow.

### 2.7 Inspections export
A PDF report **already exists** and is already bound to the model, so it is in
the print menu today: `construction_form.action_report_form_inspection`
(`construction_form/report/form_report.xml`). Only Excel is missing.

There is no xlsx export anywhere in the repo, but `openpyxl` is proven available
(`construction_boq/wizard/boq_import.py`) and there is a clean controller
precedent: `majal_documents/controllers/sheet_export.py`. Clone its shape,
keeping the formula-injection guard (`_safe_csv` prefixes `=`, `+`, `-`, `@`),
the UTF-8 BOM, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.

### 2.8 User-configurable document coding
`_doc_prefix` is a hardcoded Python class attribute per model; the number comes
from an `ir.sequence` auto-created lazily at padding 4 with no prefix —
`construction_base/models/construction_document_mixin.py:60-75`. Nothing is
user-editable outside developer mode.

Add a configuration screen under the existing Settings menu
(`construction_base.menu_construction_config`) listing each document type with
editable prefix and padding, writing through to the `ir.sequence` records. Keep
`_doc_prefix` as the fallback default so existing references stay valid.

---

## Phase 3 — Larger features

### 3.1 Compare two drawing revisions side by side
Nothing exists for drawings. Two reusable pieces: `construction.bim.comparison`
(`construction_bim/models/bim_compare.py`) is a TransientModel compare wizard
that re-opens itself as a dialog — the right *shape*, though it is an index diff
rather than a visual one; and the plan viewer already renders sheets with pdf.js
(`construction_pin/static/src/plan_viewer/plan_viewer.js`). Build a two-pane
viewer over `construction.drawing.revision`, defaulting the left pane to the
previous revision the way `bim_model.py:261` auto-picks it.

### 3.2 Subtasks under phases in the Gantt
`ProgrammeGantt` (`construction_planning/static/src/gantt/gantt.js:92-101`) does a
flat `searchRead` of `project.task` ordered by `wbs_code` and **never fetches
`parent_id` / `child_ids`** — a grep for those across `construction_planning/`
returns nothing. Hierarchy today is implied purely by the `wbs_code` string.

Fetch the parent/child fields, build a real tree in `get rows()`, and add
expand/collapse. Decide deliberately whether phases are parent tasks or
`wbs_code` prefixes: the demo data uses codes like "1.1" and "2.M"
(`construction_planning/demo/planning_demo.xml`), so a `wbs_code`-derived tree may
fit the existing data better than `parent_id`, which nothing currently populates.

### 3.3 Back button — both surfaces
- **Majal Field:** add a back control to the app shell (`field_app_templates.xml`).
- **Desktop:** the sidebar has none (`construction_ui/static/src/sidebar/`). The only existing control is the workspace hub's `goHome` (`workspace_hub.xml:6-9`), which navigates home rather than back. Add a history-back control beside the breadcrumb. Leave Odoo's own breadcrumbs alone — the sidebar deliberately does not touch them (`majal_sidebar.js:123-125`).

---

## Website copy

Replace the hero paragraph in `construction-erp/website/index.html`. Current text:

> One system for the bill of quantities, the variation and the payment
> certificate — and the RFI, the snag and the work order that caused them.

It is a six-noun inventory: it names artifacts but never says what the reader
gets, and the causal point — the money traces back to a site event — is buried
after the dash.

**Recommended replacement:**

> Every variation starts as something that happened on site. Majal keeps the bill
> of quantities, the variation and the payment certificate on the same database as
> the RFI, the snag and the work order behind them — so the commercial position
> always traces back to the work, from tender through handover and into operation.

Shorter alternative:

> The payment certificate and the snag that caused it live on the same database.
> Commercial control that traces back to what actually happened on site — from
> tender through handover and into long-term operation.

Must obey the site's own content rules in `website/README.md`: no invented
statistics, no social proof, no pricing.

---

## Verification

- **Every phase:** `scripts/run-tests.sh` green — 627 tests, 0 failed, 0 errors — before starting the next.
- **1.1:** reproduce as a non-admin persona *before* fixing; prove the regression test fails against the old code.
- **Navigation changes:** drive the running app with Playwright as a seeded non-admin persona — every moved button, every new tab, every removed menu.
- **Removals (1.4, 1.5, 1.6):** restart with `-u all` and confirm no `ir.ui.view` or `ref=` load errors. `construction_ui` hard-references both `construction_pin` and `construction_whatsapp`.
- **Majal Field:** exercise at a 390 px viewport, offline then online, confirming a defect with photo, assignee and reviewer round-trips through `/majal/field/api/sync`.
- **2.6:** confirm the accounting modules install cleanly in CI before merging.
- **Arabic and RTL:** every relabelled string needs its `.po` entry updated, and every moved control checked in RTL. The Change Order rename alone is 62 entries in `construction_change_order/i18n/ar_001.po` plus cross-references in six other modules.

## Not in this brief

- Renaming model `_name`s — labels change, identifiers stay.
- Removing the Plan Viewer feature or the `construction_whatsapp` module.
- Property-management modules and `infrastructure/` — neither is present on this branch (see the scope note at the top).
- Outstanding website issues from the deploy review: a mock-up screenshot shipping against the site's own "captures from a running system, not mock-ups" claim; the `videos.html` industry panels rendering nothing with JavaScript disabled; and ~54 MiB of unreferenced video files in the build output. Separate from this list, still open.
