# Commercial

[← Models](index.md) · [← Index](../index.md)

Source: `construction_boq`, `construction_progress_billing`,
`construction_change_order`, `construction_tender`, `construction_subcontractor`

The money side. Four of these models are `construction.approvable` and refuse
direct `state` writes — read [Approvals](../approvals.md) first.

The single most common mistake on this page: **every `amount_*` field is
computed.** Change the lines, not the total.

## `construction.boq` — Bill of Quantities

Inherits `mail.thread`, `mail.activity.mixin`, **`construction.approvable`**.
Does *not* inherit `construction.document.mixin`. Order `project_id, version desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Default `Bill of Quantities` |
| `project_id` | many2one `project.project` | yes | no | Indexed, `ondelete="restrict"`, domain `is_construction = True` |
| `company_id` | many2one `res.company` | — | **related, stored** | `project_id.company_id` |
| `currency_id` | many2one `res.currency` | — | **related, stored** | `project_id.currency_id` |
| `version` | integer | no | yes | Default 1. Bumped by `action_new_revision()`. |
| `previous_version_id` | many2one `construction.boq` | no | yes | |
| `state` | selection | no | no | `draft` / `approved` / `locked`. Default `draft`, tracked. **Guarded** — use the actions. |
| `section_ids` | one2many `construction.boq.section` | no | no | `copy=False` |
| `line_ids` | one2many `construction.boq.line` | no | no | `copy=False` |
| `amount_sell_total` | monetary | — | **computed, stored** | Contract amount |
| `amount_cost_total` | monetary | — | **computed, stored** | Budget cost |
| `margin_percent` | float | — | **computed, stored** | |
| `amount_variation_total` | monetary | — | **computed, stored** | Value of lines added by approved variations |
| `percent_complete` | float | — | **computed, stored** | Certified value as a percentage of the contract amount |
| `line_count` | integer | — | **computed** | |

Public methods: `action_view_lines()`, `action_approve()`, `action_lock()`,
`action_new_revision()`, `copy(default)`.

`_approval_amount()` returns `abs(amount_sell_total)`. `action_approve()` calls
`_check_approved()` first, so an unapproved BOQ over the rule threshold raises
`UserError` rather than approving.

## `construction.boq.section`

Order `boq_id, sequence, id`. Sections nest via `parent_id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | |
| `code` | char | no | no | Section number, e.g. `03` or `03.100` (CSI-style) |
| `sequence` | integer | no | no | Default 10 |
| `boq_id` | many2one `construction.boq` | yes | no | Indexed, `ondelete="cascade"` |
| `parent_id` | many2one `construction.boq.section` | no | no | `ondelete="cascade"` |
| `line_ids` | one2many `construction.boq.line` | no | no | |
| `currency_id` | many2one `res.currency` | — | **related** | `boq_id.currency_id` |
| `amount_sell` | monetary | — | **computed, stored** | |
| `amount_cost` | monetary | — | **computed, stored** | |

`construction_report` adds eight more computed CVR fields to sections:
`cvr_contract_value`, `cvr_budget_cost`, `cvr_certified_value`,
`cvr_committed_cost`, `cvr_percent_complete`, `cvr_forecast_margin`,
`cvr_forecast_margin_percent`, `cvr_margin_variance`. All computed, none stored.

## `construction.boq.line`

Order `boq_id, section_id, sequence, id`. The core commercial record.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Description |
| `item_code` | char | no | no | |
| `sequence` | integer | no | no | Default 10 |
| `boq_id` | many2one `construction.boq` | yes | no | Indexed, `ondelete="cascade"` |
| `section_id` | many2one `construction.boq.section` | no | no | `ondelete="set null"`, domain `boq_id = boq_id` |
| `project_id` | many2one `project.project` | — | **related, stored** | `boq_id.project_id` |
| `currency_id` | many2one `res.currency` | — | **related** | `boq_id.currency_id` |
| `product_id` | many2one `product.product` | no | no | Links the line to stock and material tracking |
| `uom_id` | many2one `uom.uom` | no | no | |
| `quantity` | float | no | no | Default 1.0, `digits="Product Unit of Measure"` |
| `unit_rate` | monetary | no | no | **Sell** rate |
| `cost_material` | monetary | no | no | Cost per unit |
| `cost_labour` | monetary | no | no | Cost per unit |
| `cost_equipment` | monetary | no | no | Cost per unit |
| `cost_subcontract` | monetary | no | no | Cost per unit |
| `cost_overhead` | monetary | no | no | Cost per unit |
| `unit_cost` | monetary | — | **computed, stored** | Sum of the five cost components |
| `amount_sell` | monetary | — | **computed, stored** | |
| `amount_cost` | monetary | — | **computed, stored** | |
| `margin_amount` | monetary | — | **computed, stored** | |
| `margin_percent` | float | — | **computed, stored** | |
| `amount_claimed` | monetary | — | **computed, stored** | Cumulative claimed value |
| `amount_certified` | monetary | — | **computed, stored** | Cumulative certified value |
| `analytic_account_id` | many2one `account.analytic.account` | no | no | Job-costing bucket. Actual costs booked here are compared with this line's budget. |
| `is_variation` | boolean | no | no | Line added by an approved variation rather than the original contract |
| `qty_claimed` | float | no | no | Cumulative quantity claimed. Maintained by `construction_progress_billing`. |
| `qty_certified` | float | no | no | Cumulative quantity certified by the consultant |
| `percent_complete` | float | — | **computed, stored** | |

`write()` is overridden with a `_check_boq_editable` guard — lines on a BOQ that
is no longer draft cannot be freely edited.

### From other addons

| Field | Source | Type | Notes |
| --- | --- | --- | --- |
| `task_ids` | `construction_planning` | many2many `project.task` | Programme activities delivering this item |
| `task_count` | `construction_planning` | integer | **computed** |
| `programme_percent` | `construction_planning` | float | **computed** — average reported progress of those activities |
| `subcontract_line_ids` | `construction_report` | one2many | |
| `bim_element_ids` | `construction_bim` | one2many `construction.bim.element` | |
| `bim_measure` | `construction_bim` | selection | **computed, stored, `readonly=False`** — writable. Derived from the unit of measure; override where the model measures it differently. |
| `bim_quantity` | `construction_bim` | float | **computed, stored** — model quantity |
| `bim_element_count` | `construction_bim` | integer | **computed, stored** |
| `bim_variance` | `construction_bim` | float | **computed, stored** — model quantity less billed quantity |
| `bim_variance_percent` | `construction_bim` | float | **computed, stored** |

### Creating a priced BOQ

```python
boq_id = models.execute_kw(
    DB, uid, API_KEY, "construction.boq", "create",
    [{
        "name": "Contract BOQ Rev 0",
        "project_id": project_id,
        "section_ids": [
            (0, 0, {"name": "Concrete", "code": "03", "sequence": 10}),
        ],
        "line_ids": [
            (0, 0, {"name": "Blockwork 200mm", "item_code": "03.100",
                    "quantity": 1250.0, "unit_rate": 68.0,
                    "cost_material": 31.0, "cost_labour": 14.0}),
            (0, 0, {"name": "Screed 50mm", "item_code": "03.200",
                    "quantity": 3400.0, "unit_rate": 22.0,
                    "cost_material": 9.5, "cost_labour": 6.0}),
        ],
    }],
)
```

Sections and lines are created in separate `Command` lists, so a line cannot name
a section created in the same call. Create the BOQ, read back the section ids,
then write `section_id` onto the lines.

`construction.boq.import` is a transient wizard (`boq_id`, `file`, `filename`,
`action_import()`) for XLSX upload. It is usable over RPC but the file must be
base64.

## `construction.progress.claim` — Interim Payment Certificate

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`,
**`construction.approvable`**. Order `project_id, sequence_no`.

Fields beyond the [document mixin](projects.md#constructiondocumentmixin):

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Default `Interim Payment Certificate` |
| `sequence_no` | integer | no | **yes** | IPC number. Assigned in `create()`, `copy=False`. |
| `boq_id` | many2one `construction.boq` | **yes** | no | Domain `project_id = project_id` and `state != draft` |
| `currency_id` | many2one `res.currency` | — | **related, stored** | `boq_id.currency_id` |
| `date_from` | date | no | no | Period from |
| `date_to` | date | no | no | Period to. Defaults to today (user's timezone). |
| `previous_claim_id` | many2one `construction.progress.claim` | no | yes | |
| `line_ids` | one2many `construction.progress.claim.line` | no | no | |
| `state` | selection | no | no | `draft` / `submitted` / `certified` / `invoiced` / `paid`. Default `draft`, tracked. **Guarded.** |
| `move_id` | many2one `account.move` | no | yes | The customer invoice. `copy=False`. |
| `move_payment_state` | selection | — | **related** | `move_id.payment_state` |
| `retention_percent` | float | no | no | |
| `retention_cap_percent` | float | no | no | % of contract |
| `amount_contract` | monetary | — | **related** | `boq_id.amount_sell_total` |
| `amount_work_done_cumulative` | monetary | — | **computed, stored** | |
| `amount_work_done_previous` | monetary | — | **computed, stored** | Previously certified |
| `amount_this_period` | monetary | — | **computed, stored** | |
| `retention_cumulative` | monetary | — | **computed, stored** | |
| `retention_this` | monetary | — | **computed, stored** | |
| `amount_net_cumulative` | monetary | — | **computed, stored** | |
| `amount_due` | monetary | — | **computed, stored** | Net amount due |

All seven `amount_*` / `retention_*` computes are `recursive=True` — a claim
depends on its predecessor.

Public methods: `action_load_lines()`, `action_submit()`, `action_certify()`,
`action_create_invoice()`, `action_view_invoice()`, `action_mark_paid()`.

`_approval_amount()` returns `abs(amount_this_period)` — **what the certificate
is worth this period**, not cumulatively. A rule band for claims is therefore a
per-period threshold.

`action_certify()` calls `_check_approved()`.

## `construction.progress.claim.line`

Order `claim_id, sequence, id`. **Write `qty_this_period`. Everything else is
computed or related.**

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `claim_id` | many2one `construction.progress.claim` | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `boq_line_id` | many2one `construction.boq.line` | yes | no | |
| `name` | char | — | **related** | `boq_line_id.name` |
| `section_id` | many2one | — | **related, stored** | `boq_line_id.section_id` |
| `currency_id` | many2one | — | **related** | `claim_id.currency_id` |
| `unit_rate` | monetary | — | **related** | `boq_line_id.unit_rate` |
| `qty_contract` | float | — | **related** | `boq_line_id.quantity` |
| `qty_previous` | float | no | **yes** | Carried from the previous claim |
| `qty_this_period` | float | no | no | **The one field you write** |
| `qty_cumulative` | float | — | **computed, stored** | `qty_previous + qty_this_period` |
| `pct_complete` | float | — | **computed, stored** | |
| `amount_cumulative` | monetary | — | **computed, stored** | |
| `amount_this` | monetary | — | **computed, stored** | |

```python
claim_id = models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "create",
    [{"project_id": project_id, "boq_id": boq_id,
      "date_from": "2026-07-01", "date_to": "2026-07-31",
      "retention_percent": 10.0, "retention_cap_percent": 5.0}],
)
# Populate lines from the BOQ, carrying previous quantities forward.
models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "action_load_lines",
    [[claim_id]],
)
lines = models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim.line", "search_read",
    [[["claim_id", "=", claim_id]]],
    {"fields": ["boq_line_id", "qty_contract", "qty_previous"]},
)
for line in lines:
    models.execute_kw(
        DB, uid, API_KEY, "construction.progress.claim.line", "write",
        [[line["id"]], {"qty_this_period": 120.0}],
    )
models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "action_submit", [[claim_id]],
)
```

Retention is booked to `res.company.construction_retention_account_id`, an
account created on first use if left empty.

## `construction.change.event`

Inherits `construction.document.mixin`, `mail.thread`. The pre-variation record:
something happened that may cost money.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `description` | html | no | no | |
| `origin` | selection | yes | no | `rfi` / `site_instruction` / `client_request` / `design_change` / `other`. Default `other`. |
| `source_rfi_id` | many2one `construction.rfi` | no | no | |
| `date` | date | no | no | Defaults to today (user's timezone) |
| `estimated_amount` | monetary | no | no | |
| `currency_id` | many2one | — | **related, stored** | `project_id.currency_id` |
| `state` | selection | no | no | `open` / `converted` / `rejected`. Default `open`, tracked. |
| `change_order_ids` | one2many `construction.change.order` | no | no | |
| `change_order_count` | integer | — | **computed** | |

Public methods: `action_create_change_order()`, `action_reject()`.

`construction.rfi` gains `change_event_ids`, `change_event_count` (computed) and
`action_raise_change_event()` from this addon.

## `construction.change.order` — Variation

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`,
**`construction.approvable`**. This is the model the approval engine was written
for.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `change_event_id` | many2one `construction.change.event` | no | no | |
| `boq_id` | many2one `construction.boq` | **yes** | no | Domain `project_id = project_id` |
| `currency_id` | many2one | — | **related, stored** | `boq_id.currency_id` |
| `change_type` | selection | **yes** | no | `addition` (adds scope) / `omission` (reduces scope). Default `addition`. **This is `_approval_kind()`** — rules can route additions and omissions differently. |
| `reason` | html | no | no | |
| `line_ids` | one2many `construction.change.order.line` | no | no | |
| `state` | selection | no | no | `draft` / `submitted` / `approved` / `rejected`. Default `draft`, tracked. **Guarded.** |
| `approved_date` | date | no | yes | |
| `boq_section_id` | many2one `construction.boq.section` | no | yes | BOQ section created for this variation's items |
| `amount_sell_total` | monetary | — | **computed, stored** | |
| `amount_cost_total` | monetary | — | **computed, stored** | |

Public methods: `action_submit()`, `action_approve()`, `action_reject()`,
`action_view_boq_lines()`.

`_approval_amount()` returns `abs(amount_sell_total)` — **direction is ignored**,
so an omission of half a million climbs the same chain as an addition of one. A
threshold that only caught additions would be the wrong control.

On the final approval, `_on_approval_granted` calls `action_approve()`, which
applies the lines to the BOQ: a new section is created and each line becomes a
`construction.boq.line` with `is_variation = True`. That is why
`amount_variation_total` on the BOQ moves without anyone editing the BOQ.

### `construction.change.order.line`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `change_order_id` | many2one | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `item_code` | char | no | no | |
| `name` | char | yes | no | Description |
| `uom_id` | many2one `uom.uom` | no | no | |
| `quantity` | float | no | no | Default 1.0 |
| `unit_rate` | monetary | no | no | Sell |
| `unit_cost` | monetary | no | no | |
| `currency_id` | many2one | — | **related** | |
| `amount_sell` | monetary | — | **computed, stored** | |
| `amount_cost` | monetary | — | **computed, stored** | |

## `construction.tender` — Tender package

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Not approvable.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `trade` | char | no | no | e.g. HVAC, Blockwork, Waterproofing |
| `description` | text | no | no | Scope of works |
| `currency_id` | many2one | — | **related, stored** | `project_id.currency_id` |
| `boq_id` | many2one `construction.boq` | no | no | Source BOQ. Its cost lines give the budget each bid is measured against. Domain `project_id = project_id`. |
| `closing_date` | datetime | no | no | Deadline for bidders. Tracked. |
| `state` | selection | no | no | `draft` / `issued` / `leveling` / `awarded` / `cancelled`. Default `draft`, tracked. |
| `line_ids` | one2many `construction.tender.line` | no | no | `copy=True` |
| `bid_ids` | one2many `construction.tender.bid` | no | no | |
| `bid_count` | integer | — | **computed, stored** | |
| `submitted_bid_count` | integer | — | **computed, stored** | |
| `budget_cost` | monetary | — | **computed, stored** | Summed from the BOQ cost of its lines |
| `lowest_bid` | monetary | — | **computed, stored** | |
| `highest_bid` | monetary | — | **computed, stored** | |
| `awarded_bid_id` | many2one `construction.tender.bid` | no | yes | Tracked, `copy=False` |
| `subcontract_id` | many2one `construction.subcontract` | no | yes | Created when the package was awarded. `copy=False`. |
| `award_saving` | monetary | — | **computed, stored** | Budget less awarded value. **Negative means over budget.** |

Public methods: `action_pull_boq_lines()`, `action_issue()`,
`action_start_leveling()`, `action_cancel()`, `action_reset()`,
`action_view_bids()`, `action_view_subcontract()`.

### `construction.tender.line`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `tender_id` | many2one | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `boq_line_id` | many2one `construction.boq.line` | no | no | Cost line this scope item is measured against |
| `name` | char | yes | no | Description |
| `quantity` | float | no | no | Default 1.0 |
| `uom_id` | many2one `uom.uom` | no | no | |
| `currency_id` | many2one | — | **related** | |
| `budget_cost` | monetary | — | **computed, stored** | From the linked BOQ line |

## `construction.tender.bid`

Inherits `mail.thread`. Order `amount_total` — cheapest first.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `tender_id` | many2one `construction.tender` | yes | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | `tender_id.project_id` |
| `bidder_id` | many2one `res.partner` | **yes** | no | Tracked |
| `currency_id` | many2one | — | **related, stored** | |
| `display_name` | char | — | **computed, stored** | |
| `state` | selection | no | no | `draft` / `invited` / `submitted` / `shortlisted` / `awarded` / `rejected`. Default `draft`, tracked. |
| `submitted_on` | datetime | no | yes | Tracked |
| `is_late` | boolean | — | **computed, stored** | Submitted after the closing date |
| `validity_days` | integer | no | no | How long the bidder holds the price. Default 90. |
| `lead_time_days` | integer | no | no | |
| `notes` | text | no | no | Qualifications |
| `line_ids` | one2many `construction.tender.bid.line` | no | no | `copy=True` |
| `amount_total` | monetary | — | **computed, stored** | |
| `variance_vs_budget` | monetary | — | **computed, stored** | Bid total less package budget. **Positive is over budget.** |
| `unpriced_line_count` | integer | — | **computed, stored** | Scope lines left unpriced — an incomplete bid |
| `is_complete` | boolean | — | **computed, stored** | |

Public methods: `action_load_scope()`, `action_submit()`, `action_shortlist()`,
`action_reject()`, `action_reset()`, `action_award()`.

`action_award()` creates a `construction.subcontract` and sets
`tender.awarded_bid_id` and `tender.subcontract_id`.

### `construction.tender.bid.line`

Only `unit_rate` is writable.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `bid_id` | many2one | yes | no | `ondelete="cascade"` |
| `tender_line_id` | many2one `construction.tender.line` | yes | no | `ondelete="cascade"` |
| `sequence` | integer | — | **related, stored** | |
| `name` | char | — | **related** | |
| `quantity` | float | — | **related** | |
| `currency_id` | many2one | — | **related** | |
| `unit_rate` | monetary | no | no | **The bidder's rate — the writable field** |
| `amount` | monetary | — | **computed, stored** | |
| `budget_cost` | monetary | — | **related** | `tender_line_id.budget_cost` |
| `variance` | monetary | — | **computed, stored** | Positive is over budget |

## `construction.subcontract`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Also mixes in `portal.mixin` (from `construction_portal`) so a subcontractor can
see their own.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `subcontractor_id` | many2one `res.partner` | **yes** | no | Tracked. **The portal record rule filters on this.** |
| `trade` | char | no | no | |
| `description` | text | no | no | |
| `currency_id` | many2one | — | **related, stored** | `project_id.currency_id` |
| `state` | selection | no | no | `draft` / `confirmed` / `closed`. Default `draft`, tracked. |
| `date_start` | date | no | no | |
| `date_end` | date | no | no | |
| `line_ids` | one2many `construction.subcontract.line` | no | no | |
| `retention_percent` | float | no | no | Default 10.0 |
| `retention_cap_percent` | float | no | no | Default 5.0 |
| `amount_total` | monetary | — | **computed, stored** | Subcontract value |
| `amount_certified` | monetary | — | **computed** (not stored) | Certified to date |
| `amount_retained` | monetary | — | **computed** (not stored) | Retention held |
| `payment_ids` | one2many `construction.subcontract.payment` | no | no | |
| `payment_count` | integer | — | **computed** | |

Public methods: `action_confirm()`, `action_close()`, `action_new_payment()`.

`amount_certified` and `amount_retained` are **not stored** — you cannot filter
or group on them. `amount_total` is stored and you can.

### `construction.subcontract.line`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `subcontract_id` | many2one | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `boq_line_id` | many2one `construction.boq.line` | no | no | BOQ cost item. Domain `project_id = parent.project_id`. |
| `name` | char | yes | no | Description |
| `uom_id` | many2one `uom.uom` | no | no | |
| `quantity` | float | no | no | Default 1.0 |
| `unit_rate` | monetary | no | no | **Cost** rate, not sell |
| `currency_id` | many2one | — | **related** | |
| `amount` | monetary | — | **computed, stored** | |

## `construction.subcontract.payment`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
The mirror of a progress claim, on the payables side. Order
`subcontract_id, sequence_no`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Default `Payment Certificate` |
| `subcontract_id` | many2one `construction.subcontract` | **yes** | no | `ondelete="cascade"` |
| `subcontractor_id` | many2one | — | **related, stored** | |
| `currency_id` | many2one | — | **related, stored** | |
| `sequence_no` | integer | no | **yes** | Certificate number, assigned in `create()`. `copy=False`. |
| `date` | date | no | no | Defaults to today (user's timezone) |
| `previous_payment_id` | many2one | no | yes | |
| `line_ids` | one2many `construction.subcontract.payment.line` | no | no | |
| `backcharge_ids` | one2many `construction.subcontract.backcharge` | no | no | |
| `state` | selection | no | no | `draft` / `submitted` / `certified` / `billed` / `paid`. Default `draft`, tracked. |
| `move_id` | many2one `account.move` | no | yes | The vendor bill. `copy=False`. |
| `retention_percent` | float | no | no | |
| `retention_cap_percent` | float | no | no | |
| `amount_subcontract` | monetary | — | **related** | `subcontract_id.amount_total` |
| `gross_cumulative` | monetary | — | **computed, stored** | |
| `gross_previous` | monetary | — | **computed, stored** | |
| `gross_this` | monetary | — | **computed, stored** | |
| `retention_cumulative` | monetary | — | **computed, stored** | |
| `retention_this` | monetary | — | **computed, stored** | |
| `backcharge_this` | monetary | — | **computed, stored** | |
| `amount_due` | monetary | — | **computed, stored** | Net payable |

Public methods: `action_submit()`, `action_certify()`, `action_create_bill()`,
`action_view_bill()`, `action_mark_paid()`.

This model is **not** approvable — it has no approval guard, and `state` can be
written directly. If your deployment needs a threshold on subcontractor
payments, that is a gap worth raising with the product owner rather than an API
you should exploit.

### `construction.subcontract.payment.line`

Write `qty_this_period` only.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `payment_id` | many2one | yes | no | `ondelete="cascade"` |
| `subcontract_line_id` | many2one | yes | no | |
| `name` | char | — | **related** | |
| `currency_id` | many2one | — | **related** | |
| `unit_rate` | monetary | — | **related** | |
| `qty_contract` | float | — | **related** | |
| `qty_previous` | float | no | **yes** | |
| `qty_this_period` | float | no | no | **The writable field** |
| `qty_cumulative` | float | — | **computed, stored** | |
| `amount_cumulative` | monetary | — | **computed, stored** | |
| `amount_this` | monetary | — | **computed, stored** | |

### `construction.subcontract.backcharge`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `payment_id` | many2one | yes | no | `ondelete="cascade"` |
| `name` | char | yes | no | Reason |
| `defect_id` | many2one `construction.defect` | no | no | Related defect |
| `amount` | monetary | no | no | |
| `currency_id` | many2one | — | **related** | |

## Reading the commercial position

```python
"""Contract value, certified to date and forecast margin, per project."""
rows = models.execute_kw(
    DB, uid, API_KEY, "project.project", "search_read",
    [[["is_construction", "=", True],
      ["construction_stage", "not in", ["closed"]]]],
    {"fields": ["name", "project_code", "currency_id",
                "cvr_contract_value", "cvr_certified_value",
                "cvr_percent_complete", "cvr_committed_cost",
                "cvr_forecast_margin", "cvr_forecast_margin_percent",
                "cvr_margin_variance"],
     "order": "name"},
)
for row in rows:
    print(f"{row['project_code']:10} {row['cvr_contract_value']:>14,.0f}"
          f" {row['cvr_percent_complete']:>6.1f}%"
          f" {row['cvr_margin_variance']:>+14,.0f}")
```

`cvr_contract_value`, `cvr_uncommitted_budget` and `cvr_margin_variance` are the
only three CVR fields with `search=` handlers — you can filter on those, and only
those.
