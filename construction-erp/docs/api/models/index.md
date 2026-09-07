# Models

[← Index](../index.md)

One page per domain area. Each field table gives **name, type, required, readonly
and description**, and flags computed and related fields — because writing to
those silently does nothing.

| Page | Models |
| --- | --- |
| [Projects](projects.md) | `project.project` construction extensions, `construction.document.mixin`, planning and task dependencies |
| [Commercial](commercial.md) | BOQ and lines, progress claims, change orders, tenders and bids, subcontracts and payments |
| [Site](site.md) | RFIs, submittals, drawings and revisions, defects, daily logs, inspections, meetings, plan pins, materials |
| [HSE](hse.md) | Permits to work, incidents, toolbox talks, project safety statistics |
| [Facilities](facilities.md) | Locations, assets, work orders, SLAs, maintenance contracts, PM plans, spare parts, floor plans |
| [Documents](documents.md) | Controlled documents and versions, templates, structured sheets, offline sync operations |
| [BIM](bim.md) | Models, elements, properties, pins, clashes, comparisons, BCF exchange |
| [Messaging](messaging.md) | WhatsApp accounts, templates, message log |
| [Property](property.md) | Portfolio, sales, leasing, handover, service charges, listings and accounting |

Approval configuration (`construction.approval.rule`, `.rule.step`, `.request`,
`.step`, `.delegation`) is documented in [Approvals](../approvals.md).

Administration models (`majal.access.role`, `majal.capability.pack`,
`majal.admin.audit`, `res.users` extensions) are documented in
[Security](../security.md).

## How to read these tables

| Column | Meaning |
| --- | --- |
| **Type** | The Odoo field class. Many2one entries name the comodel. |
| **Required** | `yes` means the ORM rejects a create without it. |
| **Readonly** | `yes` means `readonly=True` on the field definition. |

Three markers appear in the Readonly column and override it:

- **computed** — no `store=True`. Cannot be written, cannot be searched unless the
  field defines a `search=` handler. Not present as a database column.
- **computed, stored** — `store=True`. Searchable and orderable, but still not
  writable unless it defines an `inverse=`.
- **related** — mirrors a field on another record. Writable only where the
  definition says `readonly=False`; otherwise write the source.

> `readonly=True` in Odoo is a **client-side hint**. It does not block a write
> over RPC. Computed fields are the ones that genuinely ignore writes. Where a
> readonly field is also server-maintained (sequence numbers, decision
> timestamps, `tag_token`), writing it will succeed and corrupt the record —
> use the documented method instead.

## Cross-cutting conventions

Every construction document model inherits `construction.document.mixin`, which
supplies `name`, `reference`, `project_id`, `company_id`, `ball_in_court_id`,
`date_required` and `is_overdue`. Those seven are documented once, in
[Projects](projects.md#constructiondocumentmixin), and referenced rather than
repeated.

Six models inherit `construction.approvable` and gain `approval_state`,
`approval_summary`, `approval_blocked` and `approval_request_ids`, plus the write
guards. See [Approvals](../approvals.md).

Most models inherit `mail.thread` and therefore carry `message_ids`,
`message_follower_ids` and `activity_ids` from Odoo. Fields marked `tracking=True`
in the source write a chatter entry when they change.

## Discovering fields on a live deployment

The tables here describe the shipped source. A client may have added Studio fields
on top. `fields_get` is authoritative for the deployment you are talking to:

```python
definition = models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "fields_get",
    [], {"attributes": ["string", "type", "required", "readonly",
                        "relation", "selection", "store"]},
)
for name, spec in sorted(definition.items()):
    print(name, spec["type"], spec.get("required"), spec.get("store"))
```

`store: False` in that output is the reliable signal for "computed, not stored".
