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
  shared document-numbering mixin with ball-in-court tracking.
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

**Facilities / CAFM (Phase 4 — in progress)** — built on Odoo Maintenance:
- **facility_asset** — asset registry: **location hierarchy** (site→building→
  floor→room), asset parent/child, criticality, warranties (expiry-alert cron),
  **meters & readings**, **failure codes** (problem/cause/remedy) and downtime
  on maintenance requests, and spare-part lists. New **Facilities** app.
- **facility_workorder** — **job plans**, **preventive-maintenance plans**
  (calendar- and meter-based) that auto-generate maintenance work orders via
  cron, a work-order **checklist** copied from the job plan, and labour /
  parts / contractor **costing**.
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

```bash
cd construction-erp
cp .env.example .env
docker compose up -d --build
# initialize a database with the construction suite + accounting + demo data
docker compose exec odoo odoo -c /etc/odoo/odoo.conf -d erp \
  -i construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_progress_billing,construction_change_order,construction_subcontractor,facility_asset,facility_workorder,facility_floorplan,om_account_accountant \
  --stop-after-init
docker compose restart odoo
```

Open http://localhost:8069 (db `erp`, login `admin` / `admin`). Demo data
includes the "Al Noor Tower" project with a BOQ, drawings and RFIs, plus the
full accounting app (financial reports, assets, budgets).

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
