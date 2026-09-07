# Reuse vs. Build Decisions

Policy: before building a module, check whether a free, license-compatible
(LGPL-3 / AGPL-3 / OPL-1-compatible) module already exists for Odoo 18. If it
does and it fits our architecture, vendor and pin it instead of writing our
own. This file records those evaluations.

## Accounting — REUSE (Odoo Mates "Accounting Community")

**Decision:** vendor `om_account_accountant` and its 7 companion modules from
[odoomates/odooapps @ 18.0](https://github.com/odoomates/odooapps/tree/18.0)
into `third-party-addons/` (pinned in `third-party-repos.yml`).

**Why:** Odoo Community's `account` module gives invoicing and basic
bookkeeping, but the accounting depth a contractor needs — dynamic financial
statements (P&L, balance sheet, cash flow), general ledger / trial balance /
aged reports, **asset management**, **budgets**, fiscal-year close, recurring
payments and customer follow-ups — is Enterprise-only in stock Odoo. The Odoo
Mates suite provides all of it for free under **LGPL-3**, is actively
maintained for 18.0, and depends only on core `account`/`mail`. Building this
ourselves would be weeks of work duplicating a mature, widely-used app.

Modules vendored (all LGPL-3):
`accounting_pdf_reports` (report engine + financial statements),
`om_account_accountant` (umbrella app), `om_account_asset` (asset management),
`om_account_budget` (budgets), `om_fiscal_year`, `om_recurring_payments`,
`om_account_daily_reports` (cash/day/bank book), `om_account_followup`.

**Interaction with OCA:** this supersedes the OCA `account_financial_report`
for standard statements, so that OCA module is no longer vendored by default.
OCA `mis_builder` is still vendored — it is complementary, used for custom
management reports (construction CVR / WIP) rather than statutory statements.

## BOQ — BUILD (kept our `construction_boq`)

**Decision:** keep the custom `construction_boq` module.

**Why:** the free open-source "BOQ on GitHub" option,
[OpenConstructionERP](https://github.com/datadrivenconstruction/OpenConstructionERP)
(AGPL-3), is a **standalone FastAPI/React application** (`pip install
openconstructionerp`), not a set of Odoo addons — it cannot be installed into
an Odoo addons path, so it does not fit this stack. The Odoo-addon BOQ modules
on the Apps Store (Probuse, EB, SDLC, Ishan) are **paid**. Our
`construction_boq` is already built, tested (LGPL-3), and purpose-integrated
with the downstream retention / progress-billing flow, so it remains the right
choice — no third-party BOQ saves net effort here.

## Facilities / maintenance — REUSE (already planned)

Facilities builds on core `maintenance` plus OCA `maintenance` modules
(`maintenance_plan`, equipment hierarchy, `maintenance_request_purchase`,
`maintenance_equipment_contract`) already vendored in `oca-repos.yml`; the
custom `facility_*` modules only add what those don't cover (see
`docs/roadmap.md`).
