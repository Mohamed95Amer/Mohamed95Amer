# Conventions

[← Index](index.md)

Everything here is Odoo 18 ORM behaviour. It applies uniformly to every Majal model.

## Record IDs

Every record is identified by an integer `id`, unique per model, never reused,
assigned by a Postgres sequence. IDs are stable and safe to store in an external
system as the join key.

`id` is not exposed as a writable field. `create` returns the new id (or a list of
ids for a multi-create); `search` returns a list of ids.

XML IDs (`module.record_name`) exist for configuration data loaded from the addons
and can be resolved with:

```python
group_id = models.execute_kw(
    DB, uid, API_KEY, "ir.model.data", "check_object_reference",
    ["construction_base", "group_construction_pm"],
)  # -> ["res.groups", 42]
```

## Search domains

A domain is a list in Polish (prefix) notation. Leaves are `[field, operator, value]`;
operators `"&"` (implicit), `"|"` and `"!"` are strings placed *before* their operands.

```python
# Certified claims on project 7 worth more than 100000
domain = [
    ["state", "=", "certified"],
    ["boq_id.project_id", "=", 7],
    ["amount_due", ">", 100000],
]

# Open or reopened defects that are critical
domain = [
    "|", ["state", "=", "open"], ["state", "=", "reopened"],
    ["severity", "=", "critical"],
]
```

Useful operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `=like`, `like`, `ilike`,
`not ilike`, `in`, `not in`, `child_of`, `parent_of`, `any`, `not any`.

Dotted paths traverse many2one relations (`boq_id.project_id.name`). They work in
domains but **not** in the `fields` list of `read`/`search_read` — read the related
record separately, or use a stored related field where Majal already defines one.

### Non-stored computed fields in domains

A computed field with no `store=True` has no column and normally cannot be searched.
Majal defines explicit `search=` handlers for several of them, so they *are*
searchable:

| Model | Field | Search handler |
| --- | --- | --- |
| `construction.approval.step` | `waiting_days` | translated into a `requested_on` cut-off; note the inversion — waiting longer means requested earlier |
| `construction.document.mixin` (RFI, submittal, claim, …) | `is_overdue` | `date_required < today` |
| `construction.permit` | `is_live` | state + validity window |
| `maintenance.equipment` | `warranty_active` | `warranty_date` |
| `contract.contract` | `days_to_expiry`, `margin`, `covered_cost`, `chargeable_cost`, `pm_visits_remaining` | recomputed and filtered in Python |

Any computed field *not* in that list and not stored will raise if you search on it.
`waiting_days` additionally raises `ValueError: Unsupported operator for
waiting_days: <op>` for operators outside `> >= < <= = !=`.

## Reading records

```python
ids = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "search",
    [[["state", "=", "submitted"]]],
    {"limit": 50, "offset": 0, "order": "date_required asc, id desc"},
)
rows = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "read",
    [ids], {"fields": ["reference", "name", "project_id", "state", "date_required"]},
)
```

`search_read` does both in one round trip and is what you should normally use:

```python
rows = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "search_read",
    [[["state", "=", "submitted"]]],
    {"fields": ["reference", "name", "state"], "limit": 50, "offset": 0,
     "order": "id desc"},
)
```

### Pagination

Use `limit` + `offset` with a **deterministic `order`** that ends in `id`. Without a
tiebreaker, rows can repeat or vanish between pages. Get the total with
`search_count` (which accepts an optional `limit` to cap the count cheaply).

```python
PAGE = 200
offset = 0
while True:
    page = models.execute_kw(
        DB, uid, API_KEY, "construction.defect", "search_read",
        [[["project_id", "=", 7]]],
        {"fields": ["reference", "state", "severity"],
         "limit": PAGE, "offset": offset, "order": "id asc"},
    )
    if not page:
        break
    offset += len(page)
```

For incremental sync, filter on `write_date` rather than paging the whole table:

```python
domain = [["write_date", ">", "2026-07-01 00:00:00"]]
```

`write_date` exists on every model and is UTC.

## Value shapes

| Field type | Read as | Write as |
| --- | --- | --- |
| `Char`, `Text`, `Html`, `Selection` | string | string (`False` for empty) |
| `Integer`, `Float`, `Monetary` | number | number |
| `Boolean` | `true`/`false` | `true`/`false` |
| `Date` | `"2026-07-31"` | same |
| `Datetime` | `"2026-07-31 14:05:00"` (**UTC, naive**) | same |
| `Many2one` | `[id, "Display Name"]`, or `false` | integer id, or `false` |
| `One2many`, `Many2many` | list of ids | `Command` list — see below |
| `Binary` | base64 string | base64 string |
| `Json` (e.g. `majal.offline.operation.payload`) | JSON value | JSON value |

An empty value of any type reads back as `false`, not `null` or `""`. Write `False`
to clear a field.

### x2many writes — Command tuples

```python
VALUES = {
    "line_ids": [
        (0, 0, {"name": "Blockwork", "quantity": 120, "unit_rate": 45.0}),  # create
        (1, 88, {"quantity": 130}),                                        # update id 88
        (2, 89, 0),                                                        # delete id 89
        (3, 90, 0),                                                        # unlink (m2m)
        (4, 91, 0),                                                        # link (m2m)
        (5, 0, 0),                                                         # clear all
        (6, 0, [91, 92]),                                                  # replace set
    ]
}
```

`0` create, `1` update, `2` delete, `3` unlink, `4` link, `5` clear, `6` set.
Only `4`, `3`, `6` are meaningful on many2many; `2` deletes the target record.

## Computed and related fields

Writing to a computed field without `inverse=` **silently does nothing** — no error
is raised, the value is simply recomputed. The field tables in
[models/](models/index.md) flag every computed and related field. Notable traps:

- `construction.boq.amount_sell_total` and every `amount_*` on BOQ, claims,
  change orders, subcontract payments are computed. Change the lines, not the total.
- `construction.progress.claim.line.qty_cumulative`, `amount_cumulative`,
  `amount_this`, `pct_complete` are computed from `qty_previous + qty_this_period`.
  Write `qty_this_period`.
- `maintenance.request.total_cost`, `labor_cost`, `parts_issued_value` are computed.
- `maintenance.equipment.qr_tag_url` / `nfc_tag_url` are computed from `tag_token`.

Related fields with `store=True` and no `readonly=False` behave the same way: write
the source. The two Majal related fields that *are* writable are
`maintenance.request.facility_contract_id` (`readonly=False`) and
`construction.boq.line.bim_measure` (`readonly=False`).

## Dates and time zones

- `Date` fields carry no time zone. They are literal calendar dates.
- `Datetime` fields are **stored and transported in UTC as naive strings**
  (`"%Y-%m-%d %H:%M:%S"`). There is no offset in the wire format. Convert on your
  side; do not assume the server's local time.
- The user's time zone affects *computed* dates. `fields.Date.context_today` — used
  as the default for `construction.defect.date_identified`,
  `construction.daily.log.log_date`, `construction.permit` validity and many others —
  resolves "today" in the **user's** `tz`. If the integration user has no `tz` set,
  Odoo falls back to UTC, and a site in UTC+04:00 will book late-evening records on
  the wrong day.

Set `tz` on the integration user, or pass it per call:

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.daily.log", "create",
    [{"project_id": 7}],
    {"context": {"tz": "Asia/Riyadh", "lang": "en_US"}},
)
```

SLA clocks (`facility.sla.policy`) are measured in **working hours** against a
`resource.calendar`, not elapsed hours. `sla_response_deadline` and
`sla_resolution_deadline` are absolute UTC datetimes already resolved against that
calendar — do not recompute them yourself.

## Multi-company

Majal is multi-company. Most transactional models carry `company_id`, usually
related from the parent (`construction.document.mixin.company_id` is
`related="project_id.company_id", store=True`).

Records are filtered by the companies **active in the request**, which come from the
`allowed_company_ids` context key, defaulting to the user's `company_ids`:

```python
models.execute_kw(
    DB, uid, API_KEY, "maintenance.request", "search_read",
    [[]], {"fields": ["name"], "context": {"allowed_company_ids": [1, 3]}},
)
```

`self.env.company` — used for defaults such as `currency_id` on approval rules and
`company_id` on `majal.sheet` — is the **first** entry of `allowed_company_ids`.
Pass it explicitly when creating records for a company other than the user's default.

## Currency

Monetary fields need a companion currency field to render and to compare. Majal
resolves it consistently:

- Project documents: `currency_id` related from `project_id.currency_id`
- Facility records: `currency_id` related from `company_id.currency_id`
- `majal.sheet`: `currency_id` is a real, required field defaulting to the company currency

Always read the currency alongside the amount. Do not assume one currency per
database.

## Language and translation

Pass `{"context": {"lang": "ar_001"}}` to get Arabic values for translated fields
(`majal.document.name` / `body_html`, `majal.document.template.*`,
`majal.access.role.name` / `description`). Majal's own document models additionally
carry an explicit `language` selection field (`en_US` / `ar_001`) which is data, not
context — it records what language the document *is in*.

## Private methods are not callable

Odoo 18 refuses any remote call to a method whose name starts with `_`, or that is
decorated `@api.private` (`odoo/service/model.py`, `get_public_method`):

```
AccessError: Private methods (such as 'majal.offline.operation._sync_batch')
cannot be called remotely.
```

This is a hard rule and it shapes the API surface. `_sync_batch`, `_check_approved`,
`_apply_to_boq`, `_match`, `_approvers` and every other underscore method are
internal. The public entry points are the `action_*` methods and the handful of
`@api.model` helpers documented per model.

## Next

- [XML-RPC](xmlrpc.md)
- [JSON-RPC](jsonrpc.md)
- [Errors](errors.md)
