# Competitor Research Summary (2025–2026)

Distilled findings that drive this product's feature set. Four platforms
define the bar: Procore (enterprise construction system of record),
Fieldwire (field-first execution), PlanRadar (pin-on-plan defect/inspection
documentation), IBM Maximo (enterprise asset management).

## Procore — the enterprise system of record
**Edge:** unlimited-user pricing (whole project team on one platform), single
connected dataset from bid to closeout, financials tied to field data.
**Key workflows to match:** RFI lifecycle with ball-in-court and RFI→change
traceability; submittal packages with multi-reviewer approve /
revise-and-resubmit chains; drawing management (OCR naming, revision
control, overlay + side-by-side compare); daily logs; meeting minutes with
carried action items; change chain Change Event → PCO → Prime Contract CO
plus commitment COs; budget/commitments; upstream (owner) and downstream
(subcontractor) progress invoicing; bidding with prequalification.
**Weaknesses to exploit:** expensive (ACV-based, ~$20–35k/yr mid-size),
opaque sales, heavy onboarding, clunky field UX.

## Fieldwire (Hilti) — the field-first tool crews actually open
**Edge:** offline-first mobile plan viewer; task-on-plan pinning (3 taps:
pin, photo, assign); blue-collar-simple UX; punch lists; custom mobile
forms; as-built markups per sheet revision; auto PDF reports.
**Weaknesses to exploit:** per-seat pricing scales badly; field-only — no
financials, no ERP tie-in, field data never reaches accounting.

## PlanRadar — pin-on-plan documentation for Europe/MENA
**Edge:** location-pinned tickets on 2D plans/BIM with photos/voice; no-code
customizable forms and reports; recurring inspections; digital site diary;
handover & defect-liability (DLP) tracking; **free subcontractor accounts**;
20+ languages; GDPR-native.
**Weaknesses to exploit:** documentation layer only — no BOQ, costing or
billing.

## IBM Maximo — the EAM gold standard
**Edge:** asset registry with multi-level hierarchies, locations, warranties,
meters; work orders with escalations and SLAs; PM schedules auto-generating
WOs (calendar + meter/condition based); job plans and safety plans; failure
codes and root cause; spare parts with automated reorder; service
request/helpdesk with SLA compliance; downtime and maintenance-cost
analytics; IoT-driven predictive maintenance.
**Weaknesses to exploit:** 12–18 month implementations, $200–500k consulting,
steep learning curve, over-engineered for 50–500-user FM teams.

## Our strategy
1. **Odoo Community as the free ERP backbone** — accounting, purchasing,
   inventory, HR and timesheets already integrated: closes Fieldwire's and
   PlanRadar's field-to-office gap out of the box.
2. **Custom construction commercial layer** (BOQ → subcontracts → change
   orders → progress claims with retention) — the piece missing from every
   field tool and from Odoo core.
3. **Pin-on-plan field UX** on responsive web/PWA with free portal users —
   PlanRadar's adoption lever without per-seat pricing.
4. **Facilities on core `maintenance` + OCA** — Maximo's essential workflows
   (asset hierarchy, PM generation, SLA escalation, spare parts) with
   days-not-years implementation.
