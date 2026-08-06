# Facilities

[← Models](index.md) · [← Index](../index.md)

Source: `facility_asset`, `facility_workorder`, `facility_sla`,
`facility_contract`, `facility_inventory`, `facility_floorplan`, `facility_portal`

The facilities side does **not** introduce its own asset or work-order model. It
extends Odoo's `maintenance.equipment` and `maintenance.request` — so a work order
*is* a `maintenance.request`, and everything stock Odoo does with those still
applies.

Visibility here is assignment-based, not project-based. See
the "Facilities — assignment-scoped" section of [Security](../security.md).

## `facility.location`

The facility hierarchy. Order `complete_name`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | |
| `code` | char | no | no | |
| `location_type` | selection | **yes** | no | `site` / `building` / `floor` / `room` / `zone`. Default `building`. |
| `parent_id` | many2one `facility.location` | no | no | Indexed, `ondelete="cascade"` |
| `parent_path` | char | no | no | Indexed. Odoo's hierarchy path — enables `child_of` / `parent_of`. |
| `child_ids` | one2many `facility.location` | no | no | |
| `complete_name` | char | — | **computed, stored, recursive** | Full path, e.g. `Riverside / Tower A / L3 / Plant Room` |
| `company_id` | many2one `res.company` | no | no | Defaults to `env.company` |
| `active` | boolean | no | no | Default `True` |
| `asset_count` | integer | — | **computed** | |
| `manager_user_id` | many2one `res.users` | no | no | **Facility manager — drives the record rules.** Domain `share = False`. |
| `member_user_ids` | many2many `res.users` | no | no | **Facility team — drives the record rules.** Domain `share = False`. |
| `floorplan_ids` | one2many `facility.floorplan` | no | no | From `facility_floorplan` |
| `floorplan_count` | integer | — | **computed** | |
| `stock_location_id` | many2one `stock.location` | no | **yes** | Parts store. From `facility_inventory`, created on demand by `ensure_store()`. `copy=False`. |
| `on_hand_value` | monetary | — | **computed** | |
| `part_count` | integer | — | **computed** | |
| `currency_id` | many2one | — | **related, readonly** | `company_id.currency_id` |

Public methods: `action_view_assets()`, `action_view_floorplans()`,
`ensure_store()`, `action_open_stock()`.

Because `parent_path` is maintained, hierarchical domains work:

```python
assets = models.execute_kw(
    DB, uid, API_KEY, "maintenance.equipment", "search_read",
    [[["facility_location_id", "child_of", site_location_id]]],
    {"fields": ["name", "barcode", "criticality", "facility_location_id"]},
)
```

## `maintenance.equipment` — Assets

Odoo's equipment model, extended by `facility_asset` (and touched by
`facility_inventory` and `facility_portal`). Stock Odoo fields — `name`,
`category_id`, `technician_user_id`, `owner_user_id`, `company_id`,
`warranty_date`, `maintenance_ids` and the rest — are unchanged and not repeated
here.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `facility_location_id` | many2one `facility.location` | no | no | Indexed |
| `parent_id` | many2one `maintenance.equipment` | no | no | Parent asset. `ondelete="set null"`. |
| `child_ids` | one2many `maintenance.equipment` | no | no | |
| `criticality` | selection | no | no | `low` / `medium` / `high` / `critical`. Default `medium`, tracked. **Feeds SLA matching.** |
| `barcode` | char | no | no | Human-readable asset code. Unique SQL constraint, `copy=False`. Auto-filled from the `facility.asset.tag` sequence on create. |
| `tag_token` | char | no | **yes** | **SECRET — the QR/NFC tag credential.** `secrets.token_urlsafe(24)`, unique, indexed, `copy=False`. See [Security](../security.md#tag_token-in-particular). |
| `tag_status` | selection | **yes** | no | `active` / `missing` / `retired`. Default `active`, tracked. Only `active` resolves at the tag route. |
| `nfc_uid` | char | no | no | Optional hardware UID from the physical tag. `copy=False`, tracked. |
| `qr_tag_url` | char | — | **computed** | **Embeds `tag_token`.** Do not export. |
| `nfc_tag_url` | char | — | **computed** | **Embeds `tag_token`.** |
| `qr_tag_encoded_url` | char | — | **computed** | **Embeds `tag_token`.** |
| `scan_ids` | one2many `facility.asset.scan` | no | no | Tag scan history |
| `scan_count` | integer | — | **computed** | |
| `last_scan_at` | datetime | no | yes | `copy=False` |
| `last_scan_user_id` | many2one `res.users` | no | yes | `copy=False` |
| `last_scan_source` | selection | no | yes | `qr` / `nfc` / `manual`. `copy=False`. |
| `purchase_value` | monetary | no | no | |
| `currency_id` | many2one | — | **related** | `company_id.currency_id` |
| `expected_life_years` | integer | no | no | |
| `warranty_active` | boolean | — | **computed, searchable** | `warranty_date >= today` |
| `meter_ids` | one2many `facility.asset.meter` | no | no | |
| `spare_line_ids` | one2many `facility.spare.line` | no | no | |
| `asset_count_children` | integer | — | **computed** | |
| `portal_selectable` | boolean | no | no | From `facility_portal`. Occupants can pick this asset when reporting a fault. **Leave off for anything they should not be able to enumerate.** |

Public methods: `record_tag_scan(source="manual")`, `action_rotate_tag_token()`,
`action_open_tag_landing()`, `action_view_scans()`. See
[Endpoints → Asset tags](../endpoints/asset-tags.md).

`warranty_active` defines `_search_warranty_active`:

```python
out_of_warranty = models.execute_kw(
    DB, uid, API_KEY, "maintenance.equipment", "search_read",
    [[["warranty_active", "=", False], ["criticality", "in", ["high", "critical"]]]],
    {"fields": ["name", "barcode", "warranty_date", "facility_location_id"]},
)
```

`_cron_warranty_alerts` chases expiring warranties.

### `facility.asset.scan`

Append-only. Documented in
[Endpoints → Asset tags](../endpoints/asset-tags.md#facilityassetscan).

### `facility.asset.meter` and readings

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | e.g. Running Hours, kWh, Cycles |
| `equipment_id` | many2one `maintenance.equipment` | yes | no | Indexed, `ondelete="cascade"` |
| `uom` | char | no | no | Free text unit: hours / kWh / cycles |
| `reading_ids` | one2many `facility.asset.meter.reading` | no | no | |
| `current_value` | float | — | **computed, stored** | Latest reading |
| `last_reading_date` | date | — | **computed, stored** | |

`facility.asset.meter.reading`: `meter_id` (required, cascade), `date` (required,
defaults to today in the user's timezone), `value` (float, required), `user_id`
(defaults to the acting user). Order `date desc, id desc`.

Post a reading and a meter-triggered PM plan may generate a work order:

```python
models.execute_kw(
    DB, uid, API_KEY, "facility.asset.meter.reading", "create",
    [{"meter_id": meter_id, "date": "2026-08-01", "value": 12480.0}],
)
```

### `facility.spare.line`

`equipment_id` (required, cascade), `product_id` (many2one `product.product`,
required), `min_qty` (float, default 1.0), `note` (char). Which spares this asset
needs held, and at what minimum.

### `facility.failure.code`

`name` (required), `code` (char), `failure_type` (selection `problem` / `cause` /
`remedy`, required, default `problem`), `active` (default `True`). Order
`failure_type, code, name`.

## `maintenance.request` — Work orders

Odoo's maintenance request, extended by five Majal addons. Stock fields
(`name`, `equipment_id`, `stage_id`, `user_id`, `maintenance_type`, `priority`,
`request_date`, `schedule_date`, `description`, `company_id`) are unchanged.

### Costing and checklist — `facility_workorder`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `pm_plan_id` | many2one `facility.pm.plan` | no | **yes** | Set when the request was generated by a PM plan |
| `job_plan_id` | many2one `facility.job.plan` | no | no | |
| `checklist_ids` | one2many `facility.request.task` | no | no | |
| `checklist_progress` | float | — | **computed** | |
| `labor_hours` | float | no | no | Writable. The offline API caps it at 0–24. |
| `labor_rate` | monetary | no | no | |
| `labor_cost` | monetary | — | **computed, stored** | `labor_hours × labor_rate` |
| `parts_cost` | monetary | no | no | Writable — but see `parts_from_stock` below |
| `contractor_cost` | monetary | no | no | |
| `total_cost` | monetary | — | **computed, stored** | |
| `currency_id` | many2one | — | **related** | `company_id.currency_id` |

Public method: `action_load_job_plan()` — copies the job plan's steps into the
checklist.

`facility.request.task`: `request_id` (required, cascade), `sequence` (default
10), `name` (char, required, "Step"), `done` (boolean). Order `request_id,
sequence, id`. This is the model the offline `workorder.checklist` operation
writes.

### Parts — `facility_inventory`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `parts_line_ids` | one2many `facility.request.part` | no | no | `copy=False` |
| `parts_issued_value` | monetary | — | **computed, stored** | Value of spares actually taken out of the store |
| `parts_from_stock` | boolean | — | **computed, stored** | Parts cost came from stock movements rather than being typed in |

Public method: `action_consume_parts()` — moves planned parts to consumed and
creates the stock moves. Once parts come from stock, `parts_cost` is synchronised
from `parts_issued_value`; writing it by hand at that point is overwritten.

### `facility.request.part`

Order `sequence, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `request_id` | many2one | yes | no | Indexed, `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `product_id` | many2one `product.product` | **yes** | no | Domain `is_storable = True` |
| `uom_id` | many2one `uom.uom` | — | **computed, stored, `readonly=False`** | Writable; defaults to the product's unit |
| `quantity` | float | **yes** | no | Default 1.0 |
| `unit_cost` | float | — | **computed, stored, `readonly=False`** | Writable; from the product's cost, editable for a part bought in specially |
| `value` | monetary | — | **computed, stored** | |
| `currency_id` | many2one | — | **related, readonly** | |
| `state` | selection | **yes** | **yes** | `planned` / `consumed`. Default `planned`. Moved by `action_consume_parts()`. |
| `move_id` | many2one `stock.move` | no | **yes** | `copy=False` |
| `qty_available` | float | — | **computed** | On hand in the store this work order draws from |
| `equipment_id` | many2one | — | **related, stored** | `request_id.equipment_id`, indexed |

### Failure coding — `facility_asset`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `failure_problem_id` | many2one `facility.failure.code` | no | no | Domain `failure_type = "problem"` |
| `failure_cause_id` | many2one `facility.failure.code` | no | no | Domain `failure_type = "cause"` |
| `failure_remedy_id` | many2one `facility.failure.code` | no | no | Domain `failure_type = "remedy"` |
| `downtime_hours` | float | no | no | Asset downtime attributable to this request |
| `facility_location_id` | many2one | — | **related, stored** | `equipment_id.facility_location_id` |

### Portal — `facility_portal`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `portal_reporter_id` | many2one `res.partner` | no | no | The occupant who raised it. Indexed. **The portal record rule filters on this.** |

### SLA — `facility_sla`

Every SLA field is server-maintained. Do **not** compute deadlines yourself.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `sla_policy_id` | many2one `facility.sla.policy` | no | **yes** | Matched automatically from priority, type, and the asset's category and criticality. Tracked. |
| `sla_start` | datetime | no | **yes** | |
| `sla_response_deadline` | datetime | no | **yes** | Absolute UTC, already resolved against the working calendar |
| `sla_resolution_deadline` | datetime | no | **yes** | Absolute UTC |
| `sla_responded_on` | datetime | no | **yes** | |
| `sla_resolved_on` | datetime | no | **yes** | |
| `sla_response_state` | selection | — | **computed, stored** | Default `none` |
| `sla_resolution_state` | selection | — | **computed, stored** | Default `none` |
| `sla_breached` | boolean | — | **computed, stored** | Either clock was missed. Stored so it can be filtered and grouped. |
| `sla_resolution_hours_used` | float | — | **computed, stored** | Working hours between raising and resolving |

Public method: `action_sla_respond()` — stamps `sla_responded_on`. Call it rather
than writing the field.

`_cron_check_sla` re-evaluates the clocks; `create()` and `write()` are
overridden to assign and re-plan the SLA when the driving fields change.

```python
breaching = models.execute_kw(
    DB, uid, API_KEY, "maintenance.request", "search_read",
    [[["sla_breached", "=", True], ["sla_resolved_on", "=", False]]],
    {"fields": ["name", "equipment_id", "sla_policy_id",
                "sla_resolution_deadline", "sla_resolution_hours_used"],
     "order": "sla_resolution_deadline"},
)
```

### Contract — `facility_contract`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `facility_contract_id` | many2one `contract.contract` | — | **computed, stored, `readonly=False`** | **Writable.** Matched from the asset and the request date; override when work is under a different agreement. Indexed, domain `is_amc = True`. |
| `contract_covered` | boolean | — | **computed, stored** | The contract's scope includes this kind of work, so its cost is absorbed by the fee |
| `contract_chargeable` | boolean | — | **computed, stored** | Under a contract but outside its scope — recoverable from the client on top of the fee |

## `facility.sla.policy`

Order `sequence, id`. **First match wins**, so put the most specific policies at
the top and the catch-all at the bottom.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | |
| `sequence` | integer | no | no | Default 10. Lower is evaluated first. |
| `active` | boolean | no | no | Default `True` |
| `company_id` | many2one `res.company` | **yes** | no | Defaults to `env.company` |
| `priority` | selection | no | no | `0` Very Low / `1` Low / `2` Normal / `3` High. Empty matches any. |
| `maintenance_type` | selection | no | no | `corrective` / `preventive`. Empty matches any. |
| `category_id` | many2one `maintenance.equipment.category` | no | no | Empty matches any |
| `criticality` | selection | no | no | `low` / `medium` / `high` / `critical`. Empty matches any. |
| `response_hours` | float | **yes** | no | **Working** hours between raising and first response. Default 4.0. |
| `resolution_hours` | float | **yes** | no | **Working** hours between raising and closing. Default 24.0. |
| `calendar_id` | many2one `resource.calendar` | no | no | Working hours the clocks run against. Empty uses the company calendar; set a 24/7 calendar for round-the-clock cover. |
| `at_risk_ratio` | float | no | no | Share of the allowance after which a work order is flagged at-risk. Default 0.8 (80%). |
| `request_count` | integer | — | **computed** | |

> Both clocks are measured in **working hours against a `resource.calendar`**, not
> elapsed hours. A 4-hour response SLA raised at 16:00 on a Thursday does not
> expire at 20:00. Read `sla_response_deadline` — it is already resolved.

A contract's `sla_policy_id` **overrides** the general matrix for work on covered
assets: what was sold beats what is standard.

## `contract.contract` — Maintenance contracts

Extends the OCA `contract` addon. Only the Majal additions are listed.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `is_amc` | boolean | no | no | Treat this contract as a facilities maintenance agreement |
| `sla_policy_id` | many2one `facility.sla.policy` | no | no | Contract SLA. Overrides the general matrix for covered assets. |
| `covers_preventive` | boolean | no | no | Default `True` |
| `covers_corrective` | boolean | no | no | Default `True` |
| `covers_parts` | boolean | no | no | Default **`False`**. When off, parts consumed on covered work are recoverable from the client rather than absorbed by the fee. |
| `pm_visits_included` | integer | no | no | Planned visits the fee buys over the term. Zero when the contract is not written that way. |
| `renewal_notice_days` | integer | no | no | Default 60 |
| `renewal_notified` | boolean | no | **yes** | `copy=False` |
| `request_ids` | one2many `maintenance.request` | no | no | Work orders |
| `request_count` | integer | — | **computed** | |
| `pm_visits_used` | integer | — | **computed** | |
| `pm_visits_remaining` | integer | — | **computed, searchable** | |
| `covered_cost` | monetary | — | **computed, searchable** | Cost of work the fee has to pay for |
| `chargeable_cost` | monetary | — | **computed, searchable** | Cost outside the scope of cover — billable on top |
| `invoiced_revenue` | monetary | — | **computed** | |
| `margin` | monetary | — | **computed, searchable** | |
| `margin_percent` | float | — | **computed** | |
| `days_to_expiry` | integer | — | **computed, searchable** | |
| `recoverable_parts_value` | monetary | — | **computed** | From `facility_inventory`. Spares consumed on covered work where the contract excludes parts. |

Five computed fields define `search=` handlers and can be filtered on:
`pm_visits_remaining`, `covered_cost`, `chargeable_cost`, `margin`,
`days_to_expiry`. The rest (`request_count`, `pm_visits_used`,
`invoiced_revenue`, `margin_percent`, `recoverable_parts_value`) **cannot**.

Those five searches are implemented in Python — they recompute and filter rather
than pushing a domain to SQL. They work, but they are not cheap on a large
contract book. Narrow by company or date first.

```python
expiring = models.execute_kw(
    DB, uid, API_KEY, "contract.contract", "search_read",
    [[["is_amc", "=", True], ["days_to_expiry", "<=", 60],
      ["days_to_expiry", ">", 0]]],
    {"fields": ["name", "partner_id", "date_end", "days_to_expiry",
                "margin", "margin_percent"],
     "order": "date_end"},
)
```

`_cron_flag_renewals` sets `renewal_notified` as contracts approach their end
date.

## Preventive maintenance

### `facility.pm.plan`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | |
| `active` | boolean | no | no | Default `True` |
| `equipment_id` | many2one `maintenance.equipment` | **yes** | no | `ondelete="cascade"` |
| `maintenance_team_id` | many2one `maintenance.team` | no | no | |
| `job_plan_id` | many2one `facility.job.plan` | no | no | |
| `trigger_type` | selection | **yes** | no | `calendar` / `meter`. Default `calendar`. |
| `interval_number` | integer | no | no | Default 3 |
| `interval_type` | selection | no | no | `days` / `weeks` / `months`. Default `months`. |
| `next_date` | date | no | no | Defaults to today (user's timezone) |
| `meter_id` | many2one `facility.asset.meter` | no | no | Domain `equipment_id = equipment_id` |
| `meter_interval` | float | no | no | Generate a request each time the meter advances by this many units |
| `last_triggered_value` | float | no | **yes** | |
| `request_count` | integer | — | **computed** | |

Public methods: `action_generate_now()`, `action_view_requests()`.
`_cron_generate_pm` runs the calendar and meter checks.

### `facility.job.plan`

`name` (required), `description` (text), `estimated_duration` (float, default
labour hours for generated requests), `task_ids` (one2many), `active` (default
`True`).

`facility.job.plan.task`: `job_plan_id` (required, cascade), `sequence` (default
10), `name` (char, required, "Step"). Order `job_plan_id, sequence, id`.

## Floor plans

### `facility.floorplan`

Order `location_id, sequence, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | |
| `sequence` | integer | no | no | Default 10 |
| `location_id` | many2one `facility.location` | **yes** | no | Indexed, `ondelete="cascade"` |
| `company_id` | many2one | — | **related, stored** | |
| `active` | boolean | no | no | Default `True` |
| `note` | text | no | no | |
| `attachment_id` | many2one `ir.attachment` | no | no | The floor-plan PDF. `ondelete="restrict"`. |
| `sheet_file` | binary | — | **computed with `inverse=`, `attachment=False`** | Writable. Writing it stores the PDF as `attachment_id`. |
| `sheet_filename` | char | no | no | |
| `has_sheet` | boolean | — | **computed** | |
| `pin_ids` | one2many `facility.pin` | no | no | |
| `pin_count` | integer | — | **computed** | |

Public methods: `upload_sheet(filename, data_b64)`, `action_open_floorplan()`.
`_check_pdf` raises `ValidationError` on a non-PDF.

### `facility.pin`

Inherits [`plan.pin.mixin`](site.md#planpinmixin--shared-fields). Order
`floorplan_id, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `floorplan_id` | many2one `facility.floorplan` | **yes** | no | Indexed, `ondelete="cascade"` |
| `location_id` | many2one | — | **related, stored** | Indexed |
| `equipment_id` | many2one `maintenance.equipment` | no | no | `ondelete="cascade"` |
| `request_id` | many2one `maintenance.request` | no | no | `ondelete="cascade"` |

## `facility.parts.summary`

A **SQL view**, like `construction.material.summary`. Every field readonly;
cannot be created, written or deleted. Order `below_reorder desc, location_id,
product_id`.

Fields: `location_id` (the store), `facility_location_id`, `product_id`,
`uom_id`, `qty_on_hand`, `qty_consumed`, `min_qty`, `qty_to_order`,
`below_reorder` (boolean), `unit_cost`, `on_hand_value`, `consumed_value`,
`currency_id`.

```python
to_order = models.execute_kw(
    DB, uid, API_KEY, "facility.parts.summary", "search_read",
    [[["below_reorder", "=", True]]],
    {"fields": ["facility_location_id", "product_id", "qty_on_hand",
                "min_qty", "qty_to_order"],
     "order": "facility_location_id, product_id"},
)
```
