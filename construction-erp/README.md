# Construction & Facilities Management ERP (Odoo 18 Community)

An open-source ERP for construction contractors and facilities-management
companies, built on **Odoo 18.0 Community Edition** (LGPL-3) plus pinned
**OCA** modules, with a custom construction suite competing feature-wise with
Procore, Fieldwire, PlanRadar and IBM Maximo.

## What's inside

| Layer | Content |
|---|---|
| Odoo core | Pinned by commit in `ODOO_PINNED_SHA`, fetched by `scripts/fetch-odoo.sh` (not committed) |
| `oca-addons/` | Vendored OCA modules (field service, DMS, helpdesk, contracts, tier validation, financial reports, MIS builder, responsive web) pinned in `oca-repos.yml` |
| `custom-addons/` | The product — construction & facilities modules (see below) |

### Custom modules (Phase 1 — shipped)

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

The full multi-phase roadmap (field pins on plans, daily logs, defects,
change orders, progress/RA billing with retention, subcontractor management,
facilities asset registry/PM/SLA) is in [`docs/roadmap.md`](docs/roadmap.md).

## Quickstart (Docker)

```bash
cd construction-erp
cp .env.example .env
docker compose up -d --build
# initialize a database with the construction suite + demo data
docker compose exec odoo odoo -c /etc/odoo/odoo.conf -d erp \
  -i construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal \
  --stop-after-init
docker compose restart odoo
```

Open http://localhost:8069 (db `erp`, login `admin` / `admin`). Demo data
includes the "Al Noor Tower" project with a BOQ, drawings and RFIs.

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
- OCA: edit `oca-repos.yml`, re-run `scripts/fetch-oca.sh`, commit the
  refreshed `oca-addons/`.
