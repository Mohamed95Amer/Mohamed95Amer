# Product Roadmap

Dependency spine:
`construction_base → construction_boq → {construction_drawing → construction_pin, construction_rfi → construction_change_order} → construction_subcontractor → construction_progress_billing`
and on the facilities side
`maintenance (core) → facility_asset → facility_workorder → facility_sla → facility_contract`.
Portals trail their backing modules by one phase.

## Phase 0 — Foundation ✅
Docker/bare-metal environment, pinned Odoo 18.0 core (`ODOO_PINNED_SHA`),
vendored pinned OCA modules (`oca-repos.yml` → `oca-addons/`) and free
third-party apps (`third-party-repos.yml` → `third-party-addons/`, currently
the Odoo Mates full-accounting suite — see `docs/reuse-decisions.md`), scripts,
CI-ready test runner.

## Phase 1 — Construction core ✅ (initial scope)
- `construction_base` — groups, project extensions, document mixin
- `construction_boq` — BOQ sections/lines, budget cost split, lock + revisions
- `construction_drawing` — register, revision supersede, bulk PDF upload
- `construction_rfi` — lifecycle + ball-in-court + overdue cron
- `construction_submittal` — tier-validated review chains, R&R revision cycle
Each with demo data and TransactionCase tests.

## Phase 2 — Field operations (Fieldwire/PlanRadar parity)
- `construction_pin` + OWL Plan Viewer ✅: render sheet PDFs (bundled pdf.js) on
  canvas, pin overlay with normalized x/y, 3-tap pin → task/RFI/note create,
  status-colored pins. Mobile-first via `web_responsive` + PWA. (Defect pins
  land with `construction_defect`.)
- `construction_planning` ✅ (Primavera-style): WBS, typed dependencies
  (FS/SS/FF/SF) with lag, CPM engine (early/late dates, total float, critical
  path), Gantt via OCA `web_timeline`. Reschedule button on the project.
- `construction_daily_log` — site diary (manpower, equipment, activities,
  delays, safety), one-click PDF.
- `construction_form` — no-code inspection/checklist builder, recurring
  inspections, photo/signature answers, PDF field reports.
- `construction_defect` — punch lists + DLP defects, subcontractor assignment.
- `construction_portal` v1 — defects, RFIs, drawings, forms for portal users.
- As-built SVG markups per sheet revision.

## Phase 3 — Commercial & financial depth (Procore parity)
- `construction_subcontractor` — subcontracts on BOQ cost lines, sub claims →
  vendor bills with retention, back-charges, prequalification gating.
- `construction_change_order` — Change Event → prime/commitment CO with tier
  approval; approved prime CO lines append to BOQ as variations.
- `construction_progress_billing` — progress claims (IPC), certified
  quantities, retention % + cap to Retention Receivable, advance recovery,
  claim → customer invoice, retention release wizard (taking-over / DLP end).
- `construction_tender` — bid packages, portal bid submission, bid leveling.
- `construction_meeting` — minutes with carried-forward open items.
- `construction_report` — CVR/WIP SQL views + MIS Builder project P&L.
- Portal v2 — claim visibility/certification, submittal review, tender bids.

## Phase 4 — Facilities / CAFM (Maximo parity)
- `facility_asset` — location hierarchy (site→building→floor→room), asset
  hierarchies, criticality, warranties, meters + readings, failure codes,
  downtime, spare parts with reorder points.
- `facility_workorder` — job plans, PM auto-generation (calendar via OCA
  `maintenance_plan`, meter/condition thresholds via cron), costing,
  contractor dispatch via OCA field-service.
- `facility_sla` — SLA matrix on helpdesk tickets + maintenance requests,
  business-calendar deadlines, tiered escalation cron, MTTR/MTBF analytics.
- `facility_contract` — AMC recurring billing (OCA contract) with covered
  equipment and SLA levels.
- `facility_portal` — occupant service requests, vendor work-order execution.
- Floor-plan pins for assets/requests reusing `construction_pin`.

## Phase 5 — Analytics, AI & polish
- Drawing revision compare (side-by-side + overlay canvas compositing).
- OCR title-block auto-naming on drawing upload.
- Executive dashboards; multi-language; JS tour tests; branding theme.
- Offline data capture exploration (service worker queue) — the remaining gap
  vs native Fieldwire/PlanRadar apps.
