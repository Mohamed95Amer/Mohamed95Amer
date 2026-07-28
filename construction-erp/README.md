# Construction & Facilities Management ERP (Odoo 18 Community)

An open-source ERP for construction contractors and facilities-management
companies, built on **Odoo 18.0 Community Edition** (LGPL-3) plus pinned
**OCA** modules, with a custom construction suite competing feature-wise with
Procore, Fieldwire, PlanRadar and IBM Maximo.

## What's inside

| Layer | Content |
|---|---|
| Odoo core | Pinned by commit in `ODOO_PINNED_SHA`, fetched by `scripts/fetch-odoo.sh` (not committed) |
| `oca-addons/` | Vendored OCA modules (field service, DMS, helpdesk, contracts, tier validation, MIS builder, responsive web, Gantt timeline) pinned in `oca-repos.yml` |
| `third-party-addons/` | Vendored free community apps not from OCA — currently the Odoo Mates **full accounting** suite — pinned in `third-party-repos.yml` |
| `custom-addons/` | The product — construction & facilities modules (see below) |

**Reuse over rebuild:** where a good free module already exists we vendor and
pin it rather than writing our own. Full accounting (financial statements,
asset management, budgets, recurring payments, customer follow-ups) — otherwise
Enterprise-only — is provided for free by the LGPL-3 **Odoo Mates Accounting
Community** app (`om_account_accountant` + 7 companion modules). See
[`docs/reuse-decisions.md`](docs/reuse-decisions.md).

### Custom modules (Phases 1–3 — shipped)

- **construction_base** — security groups, construction project extensions
  (project code, contract value, retention, parties, lifecycle stages),
  shared document-numbering mixin with ball-in-court tracking, and the
  **approval engine**: rules matching a document's kind and value to a chain of
  approvers, so a variation under 50k takes one signature and one over 250k
  takes three, configured as data rather than code. Enforcement lives in the
  method rather than on the button — a `groups` attribute hides a control, it
  does not stop a script — with segregation of duties, ordered steps, a
  captured reason, delegation that records whose authority was used, and one
  **"waiting for me"** inbox across every kind of document. See
  `docs/approvals.md`.
- **construction_boq** — Bill of Quantities: hierarchical sections, priced
  lines with material/labour/equipment/subcontract/overhead budget breakdown,
  totals & margin, approval lock, versioned revisions.
- **construction_drawing** — drawing register with revision control,
  supersede workflow and bulk multi-page PDF upload (auto number/revision
  parsing from filenames).
- **construction_rfi** — RFI lifecycle (draft → submitted → answered →
  closed) with ball-in-court auto-flip, overdue cron reminders and drawing
  references.
- **construction_submittal** — submittal register with revision cycles
  (Revise & Resubmit spawns the next revision) and multi-reviewer approval
  chains via OCA `base_tier_validation`.
- **construction_pin** — Fieldwire/PlanRadar-style pins dropped on drawing
  sheets, with an interactive **OWL plan viewer** (renders the sheet PDF on a
  canvas via Odoo's bundled pdf.js, status-coloured pins, tap-to-open, and
  3-tap pin → task/RFI/note creation).
- **construction_planning** — **Primavera-style programme**: WBS, typed task
  dependencies (FS/SS/FF/SF) with lag, a critical-path (CPM) engine computing
  early/late dates, total float and the critical path, baselines & variance,
  and a Gantt timeline (OCA `web_timeline`).
- **construction_defect** — snagging / punch lists and DLP defects, pinnable on
  drawings, assignable to subcontractors, with kanban, severity and a Punch
  List PDF.
- **construction_daily_log** — digital site diary (weather, manpower,
  equipment, activities, delays) with computed totals and a PDF.
- **construction_form** — no-code inspection/checklist templates, recurring
  inspections, photo/signature evidence and PDF field reports.
- **construction_ui** — Odoo 19-inspired responsive command center, app
  workspaces, live KPIs, saved-view dashboard access and backend visual polish,
  plus **My Day**: everything assigned to one person — approvals waiting on
  them, their defects, inspections, tasks, RFIs and permits — on one thumb-sized
  screen, ordered by how much trouble it causes to ignore. See
  [`docs/screens.md`](docs/screens.md).
- **majal_branding** — client-ready Majal identity across Settings, About,
  Discuss, activities, assistant artwork, empty states, email, portal, browser
  metadata and the installable PWA. It also provides Help and the Route A
  open-source notice/source-offer page.
- **construction_progress_billing** — **Interim Payment Certificates (IPC)**:
  certify cumulative BOQ work done, withhold retention (percent, capped),
  and raise the net customer invoice; per-line % complete, Payment Certificate
  PDF.
- **construction_change_order** — Change Events (from RFIs / instructions) →
  priced **Variation Orders** that, on approval, append variation lines to the
  BOQ (adjusting the contract value, even when locked) and flow into the next
  IPC; Variation Order PDF.
- **construction_subcontractor** — subcontracts on the BOQ, **subcontractor
  payment certificates** (payable mirror of the IPC) with retention and
  **back-charges linked to defects**, generating vendor bills; Payment
  Certificate PDF.
- **construction_report** — **Cost Value Reconciliation (CVR)**, the monthly
  commercial control: contract value and certified value against budget,
  committed and incurred cost, giving earned margin, forecast final margin and
  the movement against the margin the job was tendered at. Overspend already
  signed away in subcontracts shows up in the forecast; CVR PDF. Also
  **Commercial Exposure**: contract value, approved variations against it,
  retention held and work certified but not invoiced across the whole
  portfolio, with what is sitting above a signature threshold right now — the
  board's question rather than the site's.
- **construction_tender** — **tender packages**: pull the scope from the BOQ so
  its budget travels with it, invite bidders, and compare submissions **line by
  line** — a bid with unpriced lines has not offered the whole scope, which bid
  totals alone hide. Awarding writes the winning price straight into a
  **subcontract**, so it lands in the CVR as committed cost, and marks the
  other bids unsuccessful. Bid Leveling Sheet PDF.
- **construction_material** — **site stores and material control**, built on
  Odoo stock rather than a parallel inventory: each project gets a real stock
  location, **material issues** book stock out of the store into the works
  against a BOQ item, and **waste is recorded as scrap with a reason** (offcut,
  damage, spillage, over-order, loss). The **material position** view puts
  budgeted, consumed, wasted and on-site quantities on one row per product, so
  over-consumption — the early signal of waste, theft or a mis-measured
  quantity — is visible against what was priced. Issue Docket PDF.
- **construction_dashboard** — **executive portfolio dashboard**: one call
  gathers commercial (CVR), programme (CPM slip), quality, safety (LTIFR) and
  material figures for every project, then compares any selection of them —
  metric bars scaled across the selection and coloured by meaning rather than
  series order, certified-against-contract tracks, a value-against-cost stack
  that flags over-commitment, a worst-first watchlist, and a full metric table.
  Portfolio rates are re-derived from their components, never averaged.
- **construction_hse** — **permits to work** (hot work, confined space, height,
  excavation, lifting) that cannot be approved until every mandatory precaution
  is confirmed and are auto-expired the moment their validity window closes;
  **incidents and near misses** with root-cause investigation and corrective
  actions that gate closure; **toolbox talks** with a signed attendance record;
  and **LTIFR safety statistics** computed from the labour hours already
  recorded on the daily site logs. Permit-to-Work PDF.
- **construction_meeting** — **meetings and minutes** for a series (progress,
  site, technical, HSE, client): attendance, discussion and action items. Open
  actions are carried into the next meeting automatically while keeping the
  meeting they were first raised at and a **carry count**, so an item's real
  age survives the move and the one nobody is doing stops being invisible.
  Minutes-of-Meeting PDF.
- **construction_bim** — **IFC models** indexed server-side by a dependency-free
  STEP reader, so an RFI, a defect, a task or a bill item can be attached to a
  specific wall or duct. Links are keyed on the element's **GlobalId**, the one
  identity IFC keeps stable across exports, so they survive a model being
  re-issued; an element that disappears while carrying records is flagged, never
  deleted. The reader also pulls **property sets and quantities** out of the
  file, which is what turns a model into a commercial document: a wall that
  carries its volume can be checked against the bill item somebody is being paid
  for, and every BOQ line linked to model elements shows a **model quantity and
  variance** beside the billed one. A **quantity takeoff** totals the model by
  type and storey.
  A **3D viewer** (web-ifc + three.js, fetched by `scripts/fetch-bim-libs.sh`)
  draws linked elements in the colour of their worst open item, with storey
  filtering, isolate/hide, a live section cut, IFC properties on selection, and
  **3D pins** that create the task, RFI or defect they stand for and store the
  camera they were dropped from. **4D**: a date slider drives element visibility
  from the dates of the programme tasks elements are linked to — the real
  programme, not a second one kept inside the model.
  Issues round-trip with Solibri, Navisworks, BIMcollab and Revizto as
  **BCF 2.1** archives, matched on topic GUID so a reviewer's answer updates the
  issue rather than duplicating it. Two revisions of a discipline can be
  **compared** — added, removed, renamed, moved storey, changed quantity — with
  removals that carry records flagged. Models **federate**: overlay structural
  on architectural on MEP, each tinted by discipline, and run a **clash test**
  between two of them. The test runs in the browser, where the geometry is, and
  the results come back with a status workflow — a clash somebody approved as
  "not a problem" stays quiet on every future run, and one that has been
  designed out closes itself. Any clash becomes an RFI pinned where it is, in
  one click. DWG is not supported, and clash testing is bounding-box rather
  than triangle-precise — `docs/bim.md` says what that means and what else is
  and is not there.
- **construction_whatsapp** — operational alerts over **Meta's WhatsApp Cloud
  API**, which is what Odoo's Enterprise-only WhatsApp app wraps. Permits about
  to expire, SLAs at risk or breached, RFIs landing in someone's court, defects
  assigned to a subcontractor and meeting actions carried too many times are
  queued by the events that cause them and sent by cron, so a slow API never
  blocks a save. Delivery receipts and replies come back through a webhook and
  land on the document they were about.
- **construction_portal** — **free portal users** for subcontractors, clients
  and consultants: self-service RFIs (ball-in-court), assigned defects — with a
  "ready for inspection" action — and subcontracts with their payment
  certificates. Record rules scope every page to the user's own company.

**Facilities / CAFM (Phase 4 — in progress)** — built on Odoo Maintenance:
- **facility_asset** — asset registry: **location hierarchy** (site→building→
  floor→room), asset parent/child, criticality, warranties (expiry-alert cron),
  **meters & readings**, **failure codes** (problem/cause/remedy) and downtime
  on maintenance requests, and spare-part lists. New **Facilities** app.
- **facility_workorder** — **job plans**, **preventive-maintenance plans**
  (calendar- and meter-based) that auto-generate maintenance work orders via
  cron, a work-order **checklist** copied from the job plan, and labour /
  parts / contractor **costing**.
- **facility_sla** — **response and resolution SLAs** on work orders: a policy
  matrix matched on priority, maintenance type, equipment category and asset
  criticality (first match wins), with both clocks measured on a **business
  calendar** so a promise does not burn overnight. On-track / at-risk /
  breached states, an escalation cron every 15 minutes, and SLA-breach filters
  and grouping on the work-order list.
- **facility_contract** — **annual maintenance contracts** on OCA `contract`'s
  recurring billing: the assets covered, the scope (preventive, corrective,
  parts) and the **SLA that was sold**, which outranks the standing SLA matrix
  for work on covered assets. Work orders match themselves to their contract as
  they are raised, so **absorbed cost** and **recoverable out-of-scope cost**
  stay apart and each contract shows a live **margin** against what it has
  invoiced. PM-visit entitlement is counted on delivery, and a daily cron flags
  contracts approaching their end date.
- **facility_inventory** — spare parts held in **real stores** attached to
  facility locations, drawn down by work orders. An asset takes parts from the
  nearest store above it in the hierarchy, so `parts_cost` stops being a number
  somebody typed and becomes what actually left the shelf. The **minimum
  quantity** that has always sat on the spare list finally means something, and
  parts consumed on covered work under a contract that excludes them show as
  **recoverable**.
- **facility_portal** — **occupant self-service**: report a fault against a
  piece of equipment, then follow its stage and SLA dates without a back-office
  login.
- **facility_floorplan** — **pin-on-plan for facilities**: upload a 2D floor
  plan PDF per location and drop **asset**, **maintenance-request** and
  **note** pins on it, reusing the same OWL Plan Viewer as construction
  drawings (via the shared `plan.pin.mixin`). Open it from **Facilities ▸
  Floor Plans** or a location's *Floor Plans* smart button.

The full multi-phase roadmap (field pins on plans, daily logs, defects,
change orders, progress/RA billing with retention, subcontractor management,
facilities asset registry/PM/SLA) is in [`docs/roadmap.md`](docs/roadmap.md).

## One-click cloud demo (GitHub Codespaces)

No local install needed — runs in your browser:

1. Open the repo on GitHub → green **Code** button → **Codespaces** tab →
   **Create codespace on `claude/odoo-construction-facilities-i324s2`**.
2. Wait for the automated setup to finish (first boot pulls Odoo and installs
   the accounting suite — several minutes; progress shows in the terminal).
3. When it's ready, the **Ports** tab shows port **8069** — click the globe
   icon to open it. Database `erp`, login **admin** / **admin**.

The `.devcontainer/` config boots Postgres + Odoo and seeds the demo project
automatically.

## Quickstart (Docker)

> Never used Docker or a terminal? [`docs/getting-started.md`](docs/getting-started.md) walks the same
> steps one at a time, including what to install first and what each
> command is doing.

```bash
cd construction-erp
cp .env.example .env
docker compose up -d --build
# initialize a database with the construction suite + accounting + demo data
docker compose exec odoo odoo -c /etc/odoo/odoo.conf -d erp \
  -i construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,om_account_accountant \
  --stop-after-init
docker compose restart odoo
```

Open http://localhost:8069 (db `erp`, login `admin` / `admin`). Demo data
includes the "Al Noor Tower" project with a BOQ, drawings and RFIs, plus the
full accounting app (financial reports, assets, budgets).

## BIM viewer libraries

The 3D viewer needs two upstream libraries that are **not committed** —
web-ifc's browser build alone is 6 MB. Fetch them once:

```bash
scripts/fetch-bim-libs.sh        # web-ifc (MPL-2.0) + three.js (MIT), pinned
scripts/fetch-bim-libs.ps1       # the same, for Windows PowerShell
```

Everything else about a BIM model — the element index and its linked RFIs,
defects, tasks and bill items — works without them; only the 3D canvas needs
them, and it says so on screen if they are missing.

## Quickstart (bare metal)

```bash
cd construction-erp
./scripts/fetch-odoo.sh                 # pinned shallow clone into vendor/odoo
pip3 install -r vendor/odoo/requirements.txt -r requirements-oca.txt
./scripts/init-db.sh erp                # create + install modules
./scripts/run-local.sh -d erp           # run the server
```

## Tests

```bash
./scripts/run-tests.sh all              # or a single module name
```

## Updating pins

- Odoo core: put the new commit SHA in `ODOO_PINNED_SHA`, re-run
  `scripts/fetch-odoo.sh`.
- OCA: edit `oca-repos.yml`, re-run `scripts/fetch-vendor.sh`, commit the
  refreshed `oca-addons/`.
- Third-party: edit `third-party-repos.yml`, re-run
  `scripts/fetch-vendor.sh third-party-repos.yml third-party-addons`, commit
  the refreshed `third-party-addons/`.
