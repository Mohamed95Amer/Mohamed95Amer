# Documents

[← Models](index.md) · [← Index](../index.md)

Source: `custom-addons/majal_documents/models/`,
`custom-addons/majal_field_offline/models/offline_operation.py`

Two independent document systems, plus the offline sync audit trail:

- **`majal.document`** — controlled correspondence with immutable versions and a
  checksum. Letters, contracts, quotations.
- **`majal.sheet`** — structured tabular data that can be frozen and checksummed.
  Bills, estimates, valuations, registers.

Neither uses the [approval engine](../approvals.md). Both have their own
single-approver or freeze workflow, with their own guards.

## `majal.document`

Inherits `mail.thread`, `mail.activity.mixin`. Order `document_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `reference` | char | **yes** | no | Assigned from a sequence in `create()` when left as `New`. Indexed, tracked, `copy=False`. |
| `name` | char | **yes** | no | Translated, tracked |
| `document_date` | date | **yes** | no | Defaults to today (user's timezone). Tracked. |
| `company_id` | many2one `res.company` | **yes** | no | Defaults to `env.company`. Indexed. |
| `project_id` | many2one `project.project` | no | no | Indexed, tracked. Domain `company_id = company_id`. |
| `recipient_id` | many2one `res.partner` | no | no | Tracked |
| `template_id` | many2one `majal.document.template` | no | no | Domain `company_id = company_id` |
| `document_type` | selection | — | **related, stored, readonly** | `template_id.document_type` |
| `language` | selection | **yes** | no | `en_US` / `ar_001`. Default `en_US`. **Data, not context** — it records what language the document *is in*. |
| `body_html` | html | **yes** | no | Sanitised, translated. Default `<p></p>`. |
| `state` | selection | **yes** | **yes** | `draft` / `submitted` (Awaiting Approval) / `approved` / `issued` / `rejected` / `cancelled`. Default `draft`, indexed, tracked. **Guarded** — see below. |
| `approver_id` | many2one `res.users` | no | no | Required approver. Tracked. Domain `share = False` and `company_ids in [company_id]`. |
| `submitted_by_id` | many2one `res.users` | no | yes | |
| `submitted_at` | datetime | no | yes | |
| `approved_by_id` | many2one `res.users` | no | yes | |
| `approved_at` | datetime | no | yes | |
| `approval_checksum` | char | no | yes | `copy=False` |
| `approval_note` | text | no | no | `copy=False` |
| `issued_by_id` | many2one `res.users` | no | yes | |
| `issued_at` | datetime | no | yes | |
| `current_version_id` | many2one `majal.document.version` | no | yes | `copy=False`, `ondelete="restrict"` |
| `version_ids` | one2many `majal.document.version` | no | **yes** | |
| `version_count` | integer | — | **computed** | |
| `current_revision` | integer | — | **related, readonly** | `current_version_id.revision` |
| `current_checksum` | char | — | **related, readonly** | `current_version_id.checksum` |
| `requires_qualified_signature` | boolean | no | no | Flags documents that must use an approved external trust-service provider. **Majal's internal approval is not a qualified electronic signature.** |

Public methods: `action_apply_template()`, `action_submit()`,
`action_approve()`, `action_reject()`, `action_issue()`,
`action_reset_to_draft()`, `action_print()`, `action_view_versions()`.

### The state guard

`write()` raises `AccessError: Use the document workflow buttons to change
status.` for a write touching any of `state`, `submitted_by_id`, `submitted_at`,
`approved_by_id`, `approved_at`, `approval_checksum`, `issued_by_id`,
`issued_at`, `current_version_id` — unless `env.su` **or** the context key
`majal_document_transition` is set. Like the approvable state guard, that key is
settable from an RPC context; it is an internal implementation detail, not a
supported API. Use the actions.

A second guard covers the content fields (`name`, `document_date`, `company_id`,
`project_id`, `recipient_id`, `template_id`, `language`, `body_html`,
`requires_qualified_signature`) once the document has left draft.

`_check_named_approver` enforces that the approval is given by the named
`approver_id`.

### `majal.document.version` — immutable

Order `document_id, revision desc`. Every field is `readonly=True`, and both
`write()` and `unlink()` are **overridden to refuse outright**. Versions are the
audit trail; there is no editing them.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `document_id` | many2one `majal.document` | yes | yes | Indexed, `ondelete="restrict"` |
| `company_id` | many2one | — | **related, stored, readonly** | Indexed |
| `revision` | integer | yes | yes | |
| `body_html` | html | yes | yes | Sanitised. The body as it stood at this revision. |
| `checksum` | char | yes | yes | Indexed |
| `attachment_id` | many2one `ir.attachment` | yes | yes | The rendered PDF. `ondelete="restrict"`. |
| `created_by_id` | many2one `res.users` | yes | yes | |
| `create_date` | datetime | — | yes | |

A version is created by the document's private `_create_version` at the workflow
points that need one. You cannot create one yourself.

## `majal.document.template`

Inherits `mail.thread`, `mail.activity.mixin`. Order `document_type, name`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | Translated, tracked |
| `code` | char | **yes** | no | Indexed, `copy=False` |
| `active` | boolean | no | no | Default `True` |
| `company_id` | many2one `res.company` | **yes** | no | Defaults to `env.company`. Indexed. |
| `language` | selection | **yes** | no | `en_US` / `ar_001`. Default `en_US`. |
| `document_type` | selection | **yes** | no | `letter` / `contract` / `quotation` / `submittal` / `rfi` / `inspection` / `handover` / `other`. Default `letter`. |
| `body_html` | html | **yes** | no | Sanitised, translated. Uses approved placeholders such as `{{ company.name }}`, `{{ project.name }}`, `{{ document.reference }}`. |
| `placeholder_help` | text | — | **computed** | The placeholders available |

Public method: `render_for_document(document)`.

`_check_placeholders` validates `body_html` against the approved placeholder set
and raises `ValidationError` for anything outside it. Templates are **not**
evaluated as code.

## `majal.sheet`

Inherits `mail.thread`, `mail.activity.mixin`. Order `sheet_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `reference` | char | **yes** | no | From a sequence in `create()`. Indexed, `copy=False`. |
| `name` | char | **yes** | no | Tracked |
| `sheet_date` | date | **yes** | no | Defaults to today (user's timezone) |
| `company_id` | many2one `res.company` | **yes** | no | Defaults to `env.company`. Indexed. |
| `project_id` | many2one `project.project` | no | no | Indexed. Domain `company_id = company_id`. |
| `sheet_type` | selection | **yes** | no | `boq` / `estimate` / `budget` / `valuation` / `schedule` / `register`. Default `boq`. |
| `currency_id` | many2one `res.currency` | **yes** | no | A real field, not related. Defaults to the company currency. |
| `line_ids` | one2many `majal.sheet.line` | no | no | `copy=True` |
| `amount_total` | monetary | — | **computed, stored** | |
| `state` | selection | **yes** | **yes** | `draft` / `frozen` / `archived`. Default `draft`, tracked. **Guarded.** |
| `revision` | integer | no | **yes** | Default 0. Incremented on freeze. |
| `checksum` | char | no | **yes** | SHA-256 of the canonical content. `copy=False`. |
| `frozen_by_id` | many2one `res.users` | no | **yes** | |
| `frozen_at` | datetime | no | **yes** | |
| `note` | html | no | no | Sanitised |

Public methods: `action_freeze()`, `action_new_revision()`,
`action_export_csv()`.

### The freeze model, and what raises

| Operation | Condition | Result |
| --- | --- | --- |
| `write()` touching `state`, `revision`, `checksum`, `frozen_by_id`, `frozen_at` | not `env.su` and no `majal_sheet_transition` context key | `AccessError: Use the sheet workflow buttons.` |
| `write()` touching `name`, `sheet_date`, `company_id`, `project_id`, `sheet_type`, `currency_id`, `line_ids`, `note` | the sheet is not `draft` | `UserError: Frozen sheets cannot be edited.` |
| `action_freeze()` | state is not `draft` | `UserError: Only draft sheets can be frozen.` |
| `action_new_revision()` | state is not `frozen` | `UserError: Only a frozen sheet can start a new revision.` |
| `action_new_revision()` | `majal_role_id.rank < 30` | `AccessError: A manager must reopen a frozen sheet.` |

`action_freeze()` computes a SHA-256 over the canonical content — reference,
name, sheet type, then each line as
`sequence|code|description|unit|quantity|unit_rate|amount`, sorted by
`(sequence, id)` — stores it in `checksum` and increments `revision`. Recompute
it yourself the same way to verify a sheet has not been altered.

`majal_sheet_transition` is settable from an RPC context. Do not use it; it
bypasses the workflow without producing a checksum.

### `majal.sheet.line`

Order `sheet_id, sequence, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `sheet_id` | many2one `majal.sheet` | **yes** | no | Indexed, `ondelete="cascade"` |
| `company_id` | many2one | — | **related, stored, readonly** | Indexed |
| `sequence` | integer | no | no | Default 10 |
| `code` | char | no | no | |
| `description` | char | **yes** | no | |
| `unit` | char | no | no | |
| `quantity` | float | no | no | Default 1.0, `digits=(16, 4)` |
| `unit_rate` | monetary | no | no | |
| `amount` | monetary | — | **computed, stored** | `quantity × unit_rate` |
| `currency_id` | many2one | — | **related, stored, readonly** | |
| `note` | char | no | no | |

All three of `create()`, `write()` and `unlink()` are overridden and raise
`UserError` once the parent sheet is frozen:

| Operation | Message |
| --- | --- |
| `create` | `Frozen sheets cannot receive new lines.` |
| `write` | `Frozen sheet lines cannot be changed.` |
| `unlink` | `Frozen sheet lines cannot be deleted.` |

```python
sheet_id = models.execute_kw(
    DB, uid, API_KEY, "majal.sheet", "create",
    [{
        "name": "Fit-out valuation, July",
        "sheet_type": "valuation",
        "sheet_date": "2026-07-31",
        "project_id": project_id,
        "line_ids": [
            (0, 0, {"code": "09.100", "description": "Ceiling grid",
                    "unit": "m2", "quantity": 840.0, "unit_rate": 46.5}),
            (0, 0, {"code": "09.200", "description": "Vinyl flooring",
                    "unit": "m2", "quantity": 1120.0, "unit_rate": 38.0}),
        ],
    }],
)
models.execute_kw(DB, uid, API_KEY, "majal.sheet", "action_freeze", [[sheet_id]])

frozen = models.execute_kw(
    DB, uid, API_KEY, "majal.sheet", "read", [[sheet_id]],
    {"fields": ["reference", "revision", "checksum", "amount_total", "state"]},
)[0]
```

Export it as CSV at
[`GET /majal/sheets/<id>/export.csv`](../endpoints/exports.md#get-majalsheetsintsheet_idexportcsv).

## Company document identity

`majal_documents` adds twelve fields to `res.company`, used when rendering
documents. All are ordinary writable fields.

| Field | Type | Description |
| --- | --- | --- |
| `majal_trading_name` | char | |
| `majal_registration_number` | char | |
| `majal_tax_registration_number` | char | |
| `majal_license_number` | char | Trade licence |
| `majal_document_email` | char | |
| `majal_document_phone` | char | |
| `majal_document_website` | char | |
| `majal_document_address` | text | |
| `majal_authorized_signatory` | char | |
| `majal_authorized_signatory_title` | char | |
| `majal_approval_mark` | binary | Optional company mark shown on internally approved documents. `attachment=True`. **Not a qualified electronic signature.** |
| `majal_document_footer` | html | Sanitised, translated |

## `majal.offline.operation`

The audit trail behind `POST /majal/field/api/sync`. Full field table and the
seven operation kinds are in
[Endpoints → Field app](../endpoints/field-app.md#the-audit-trail).

Read it to reconcile a device's outbox against what the server actually did:

```python
recent = models.execute_kw(
    DB, uid, API_KEY, "majal.offline.operation", "search_read",
    [[["user_id", "=", uid], ["state", "in", ["failed", "conflict"]]]],
    {"fields": ["client_uuid", "kind", "state", "result", "processed_at"],
     "order": "create_date desc", "limit": 50},
)
```

`unique(client_uuid, user_id)` is what makes resubmission safe. `_sync_batch` is
private and cannot be called over RPC.

## DMS

`majal_documents` also extends `dms.file` (from the OCA DMS addon) with one
public method, `check_access_token(access_token)`. The DMS models themselves are
OCA's and are not documented here.
