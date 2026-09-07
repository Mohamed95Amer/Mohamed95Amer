# Property models

[Models index](index.md) | [API index](../index.md)

Majal Property covers developer inventory, buyer reservations, payment schedules,
handover, leasing, maintenance, owner service charges, listings and accounting.
All examples use Odoo's authenticated ORM API; Majal does not expose a second,
unversioned REST surface for these records.

## Model map

| Area | Models |
| --- | --- |
| Portfolio | `majal.development`, `majal.community`, `majal.building`, `majal.floor`, `majal.unit.type`, `majal.unit` |
| Sales | `majal.lead`, `majal.reservation`, `majal.payment.plan`, `majal.payment.plan.line`, `majal.payment.installment`, `majal.commission`, `majal.cheque` |
| Handover and compliance | `majal.handover`, `majal.handover.snag`, `majal.property.document` |
| Leasing and operations | `majal.lease`, `majal.lease.rent.line`, `majal.lease.inspection`, `majal.lease.inspection.line`, `majal.maintenance.request` |
| Owners' association | `majal.service.charge.budget`, `majal.service.charge.budget.line`, `majal.service.charge`, `majal.owner.statement`, `majal.owner.statement.line` |
| Marketing | `majal.property.listing`, `majal.property.listing.channel`, `majal.property.listing.publication` |
| Accounting | `majal.property.accounting.settings`; invoice links extend reservations, rent lines and service charges |

The inventory hierarchy is:

```text
Development -> Community (optional) -> Building -> Floor -> Unit
            -> Unit type templates       -> listings, reservations, leases,
                                              handovers and documents
```

## Required integration context

Property records are company-scoped. Pass `allowed_company_ids` on every RPC
call and assign the integration user only to the companies it may process.

```python
context = {"allowed_company_ids": [company_id]}
units = models.execute_kw(
    DB, uid, API_KEY, "majal.unit", "search_read",
    [[
        ["company_id", "=", company_id],
        ["status", "in", ["available", "vacant"]],
    ]],
    {
        "fields": ["name", "development_id", "building_id", "floor_id",
                   "unit_category", "total_area", "list_price", "status"],
        "order": "development_id, building_id, floor_id, name",
        "context": context,
        "limit": 200,
    },
)
```

Record rules enforce the boundary even if a caller omits the company domain.
The explicit domain remains useful for clarity and predictable pagination.

## Reservation workflow

Do not write `state` or the unit's `status` directly. Workflow methods validate
availability, prevent double booking and keep the unit synchronized.

```python
reservation_id = models.execute_kw(
    DB, uid, API_KEY, "majal.reservation", "create",
    [{
        "unit_id": unit_id,
        "partner_id": buyer_partner_id,
        "expiry_date": "2026-09-15",
        "sale_price": 1450000.0,
        "reservation_fee": 25000.0,
        "payment_plan_id": payment_plan_id,
    }],
    {"context": context},
)
models.execute_kw(DB, uid, API_KEY, "majal.reservation",
                  "action_confirm", [[reservation_id]], {"context": context})
models.execute_kw(DB, uid, API_KEY, "majal.reservation",
                  "action_generate_schedule", [[reservation_id]],
                  {"context": context})
models.execute_kw(DB, uid, API_KEY, "majal.reservation",
                  "action_convert_to_sale", [[reservation_id]],
                  {"context": context})
```

Other supported actions are `action_cancel`, `action_reset_to_draft` and
`action_expire`. A confirmed hold cannot be deleted. A database partial unique
index also prevents two concurrent confirmed reservations for one unit.

## Lease workflow

```python
lease_id = models.execute_kw(
    DB, uid, API_KEY, "majal.lease", "create",
    [{
        "unit_id": unit_id,
        "tenant_id": tenant_partner_id,
        "start_date": "2026-09-01",
        "end_date": "2027-08-31",
        "frequency": "quarterly",
        "annual_rent": 120000.0,
        "deposit": 10000.0,
    }],
    {"context": context},
)
models.execute_kw(DB, uid, API_KEY, "majal.lease",
                  "action_generate_rent_schedule", [[lease_id]],
                  {"context": context})
models.execute_kw(DB, uid, API_KEY, "majal.lease",
                  "action_activate", [[lease_id]], {"context": context})
```

Activation requires a generated rent schedule and a lettable unit. Use
`action_terminate`, `action_expire`, `action_cancel` or `action_renew` for later
transitions. Do not delete an active lease.

## Service-charge workflow

Create a draft `majal.service.charge.budget` and its
`majal.service.charge.budget.line` records, then call:

```python
models.execute_kw(DB, uid, API_KEY, "majal.service.charge.budget",
                  "action_approve", [[budget_id]], {"context": context})
models.execute_kw(DB, uid, API_KEY, "majal.service.charge.budget",
                  "action_generate_charges", [[budget_id]], {"context": context})
```

Allocation is either `area` or `equal`. Generated charges add up exactly to the
budget after currency rounding. Once a payment is recorded, regeneration is
refused to preserve the financial trail.

## Listings and portal publication

The internal listing workflow is:

```text
draft -> action_submit() -> review -> action_publish() -> published
                                      -> action_pause() / action_archive()
```

External property-portal delivery is deliberately separate:

1. Create a `majal.property.listing.channel` linked to an approved integration
   provider.
2. Create `majal.property.listing.publication`.
3. Call `action_prepare()` to make the provider-neutral JSON snapshot and
   checksum.
4. Call `action_queue()` only when the provider is active and its approved
   adapter reports ready.

The base product has no unrestricted generic HTTP adapter. Without an installed
approved adapter, use the controlled snapshot/export as the safe hand-off. See
[Integration providers](../integrations.md).

## Accounting links

When `majal_property_account` is installed, these records expose
`action_create_invoice()` and `action_open_invoice()`:

- `majal.reservation` - buyer invoice
- `majal.lease.rent.line` - tenant rent invoice
- `majal.service.charge` - owner service-charge invoice

Configure journals and products in `majal.property.accounting.settings` first.
Treat invoice creation as idempotent at the caller: read the linked invoice field
before retrying after a network timeout.

## Buyer portal

Buyers use `/my/reservations` and token-protected
`/my/reservation/<id>` HTML pages. These are browser pages, not JSON endpoints.
Internal systems should query `majal.reservation` and
`majal.payment.installment` over RPC instead of scraping them.

## Methods not forming a public contract

Methods beginning with `_` are implementation details even though Odoo RPC can
technically dispatch many model methods. External clients must not call
`_set_unit_status`, `_release_unit`, `_enqueue`, `_process_batch`, `_deliver_job`
or cron methods. Use documented `action_*` workflows or an approved connector
addon.
