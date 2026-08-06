# Offline field app

[← Endpoints](index.md) · [← Index](../index.md)

Source: `custom-addons/majal_field_offline/controllers/field_app.py`,
`custom-addons/majal_field_offline/models/offline_operation.py`

Four routes. Two of them — `bootstrap` and `sync` — are the only genuine
machine-readable HTTP API Majal ships, and they are worth using even if you are
not building a mobile client: `bootstrap` answers "what is assigned to this user"
in one round trip, and `sync` gives you idempotent, conflict-aware writes.

## Session, not API key

All four routes are `auth="user"` and read the **session cookie**. Authenticate
once with `/web/session/authenticate` and reuse the session — see
[Endpoints → Authentication](index.md#authentication-for-authuser-routes).

## `GET /majal/field` and `/majal/field/`

Renders `majal_field_offline.field_app` — the PWA shell. HTML only. It receives
`user_key`, `user_name`, `company_name`, `user_lang` and `is_arabic` from the
server. Not an integration endpoint.

## `GET /majal/field/service-worker.js`

Returns the service worker source as `application/javascript; charset=utf-8`,
with `Service-Worker-Allowed: /majal/field/`, `Cache-Control: no-cache` and
`X-Content-Type-Options: nosniff`. The worker caches `/majal/field/`,
`/majal_field_offline/static/*` and `/web/content/*` under a per-user cache name,
and clears other users' caches when the signed-in user changes. Not an
integration endpoint.

## `POST /majal/field/api/bootstrap`

| Property | Value |
| --- | --- |
| `type` | `json` |
| `auth` | `user` |
| `methods` | `POST` |

**No parameters.** The response is scoped entirely to the authenticated user and
their active company.

### Request

```bash
curl -sS https://your-host/majal/field/api/bootstrap \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"jsonrpc": "2.0", "method": "call", "params": {}, "id": 1}'
```

### Response

The JSON-RPC envelope wraps the payload in `result`. `[...]` below marks elided
content — the block is a shape, not a literal response:

```json
{"jsonrpc": "2.0", "id": 1, "result": {
  "generated_at": "2026-08-01 09:14:22",
  "user": {"id": 7, "name": "…", "company": "…"},
  "projects": [...], "defects": [...], "inspections": [...],
  "workorders": [...], "assets": [...], "drawings": [...]
}}
```

All datetimes are naive UTC strings (`%Y-%m-%d %H:%M:%S`), as everywhere else in
Odoo.

### What each collection contains

| Key | Source model | Server-side filter | Limit | Order |
| --- | --- | --- | --- | --- |
| `projects` | `project.project` | `is_construction = True` | 80 | `name` |
| `defects` | `construction.defect` | `assigned_user_id = <you>` and `state in (open, in_progress, reopened, ready)` | 100 | `severity desc, date_required, id desc` |
| `inspections` | `construction.form.inspection` | `inspector_id = <you>` and `state in (draft, in_progress, rejected)` | 60 | `scheduled_date, id` |
| `workorders` | `maintenance.request` | `user_id = <you>` | 100 | `request_date desc, id desc` |
| `assets` | `maintenance.equipment` | `technician_user_id = <you>` **or** `owner_user_id = <you>` **or** `tag_status = "active"` | 120 | `name` |
| `drawings` | `construction.drawing` | project in the returned projects, and `current_revision_id` set | 80 | `project_id, number` |

The limits are hard-coded and there is **no paging**. If the user has more than
100 assigned defects you will get the first 100 by that ordering. For a complete
extract, use [XML-RPC](../xmlrpc.md) with `limit`/`offset`.

Record rules still apply on top of these filters, so a `rank < 40` user sees only
their assigned projects and facilities regardless — see
[Security](../security.md#record-rules).

> The `assets` domain is `"|", technician, owner, tag_status = active` — Odoo's
> prefix notation makes that `(technician OR owner) OR tag_status`, so **every
> active-tagged asset the user can see is returned**, not only assigned ones.
> That is what the field app needs to resolve an arbitrary scanned tag offline,
> but do not read the list as "assets assigned to this user".

### Field shapes

`projects[]` — `id`, `name`, `code` (`project_code`), `write_date`.

`defects[]` — `id`, `reference`, `name`, `project`, `location`, `severity`,
`state`, `write_date`.

`inspections[]` — `id`, `name`, `template`, `project`, `state`,
`scheduled_date`, `write_date`, and `answers[]` of
`{id, question, type, value, comment}`. **Only** answers whose type is
`yes_no`, `text`, `number` or `date` are included; photo and signature answers
are omitted because they cannot be completed offline.

`workorders[]` — `id`, `name`, `asset`, `stage`, `description`, `labor_hours`,
`write_date`, and `checklist[]` of `{id, name, done}`.

`assets[]` — `id`, `name`, `code` (`barcode`), `location`, `criticality`,
`write_date`. **`tag_token` is not returned**, deliberately.

`drawings[]` — `id`, `number`, `name`, `project`, `revision`, `content_url`
(`/web/content/<attachment_id>?download=0`, or `false`). Fetching `content_url`
needs the same session.

`write_date` is returned on every record that can be written back. Keep it — the
sync API uses it for conflict detection.

## `POST /majal/field/api/sync`

| Property | Value |
| --- | --- |
| `type` | `json` |
| `auth` | `user` |
| `methods` | `POST` |

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `operations` | list of objects | no (defaults to `[]`) | At most **100** per call |

Each operation:

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `client_uuid` | string | **yes** | Your idempotency key. 16–80 characters of `[A-Za-z0-9_-]` only. |
| `kind` | string | **yes** | One of the seven kinds below |
| `payload` | object | yes in practice | Kind-specific. A non-object is coerced to `{}`. |
| `base_write_date` | string | no | The record's `write_date` when you took it offline. Enables conflict detection. |
| `target_model` | string | no | Recorded on the operation for audit only |
| `target_id` | integer | no | Recorded for audit only |

### Response

Again a shape, with `{...}` marking elided content:

```json
{"jsonrpc": "2.0", "id": 1, "result": {
  "results": [
    {"client_uuid": "…", "status": "applied", "result": {"record_id": 91, "reference": "DEF-0091"}},
    {"client_uuid": "…", "status": "conflict", "result": {"error": "The server record changed after it was saved for offline work."}},
    {"client_uuid": "…", "status": "failed", "result": {"error": "This record is not assigned to you."}},
    {"client_uuid": "…", "status": "applied", "result": {...}, "duplicate": true}
  ],
  "server_time": "2026-08-01 09:20:03"
}}
```

| `status` | Meaning | What to do |
| --- | --- | --- |
| `applied` | Committed | Discard the local operation |
| `conflict` | The server record changed after you took it offline | Re-fetch, merge, resubmit with a **new** `client_uuid` |
| `failed` | Validation, permission or business-rule refusal | Read `result.error`; do not blindly retry |

`duplicate: true` appears when that `(client_uuid, user_id)` pair was already
received. The **original** status and result are replayed and nothing is
re-applied. This is the idempotency guarantee: resending a batch after a dropped
connection is safe.

### Ordering and atomicity

Operations are applied in array order. Each runs inside its own savepoint, so one
failure does not roll back the others or abort the batch. A batch is therefore
**partially applicable** — always read every entry in `results`.

Two errors are raised instead of returned, and abort the whole call:

| Condition | Exception |
| --- | --- |
| `operations` is not a list, or longer than 100 | `ValidationError: Sync batches may contain at most 100 operations.` |
| Any `client_uuid` fails validation | `ValidationError: Invalid offline operation identifier.` |

### Conflict detection

If you send `base_write_date`, the server compares it — truncated to whole
seconds — against the record's current `write_date`. Any difference returns
`status: "conflict"`. Omitting `base_write_date` disables the check and the
operation is applied unconditionally, last-writer-wins.

### Assignment check

For every kind that touches an existing record, `_assert_assigned` requires that
the acting user is the record's assignee **unless** their
`majal_role_id.rank >= 30`. Otherwise:
`AccessError: This record is not assigned to you.` — returned as
`status: "failed"`.

| Kind | Assignment field checked |
| --- | --- |
| `defect.progress` | `construction.defect.assigned_user_id` |
| `inspection.answer` | `construction.form.inspection.inspector_id` |
| `workorder.checklist` | `maintenance.request.user_id` |
| `workorder.note` | `maintenance.request.user_id` |
| `asset.scan` | `technician_user_id` or `owner_user_id` on the asset |

## The seven operation kinds

Nothing else is accepted. An unrecognised `kind` returns
`This operation is not allowed offline.`

### `defect.create`

Creates a `construction.defect` assigned to the acting user.

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `project_id` | integer | **yes** | Cast with `int()`; a non-numeric value fails the operation |
| `name` | string | **yes** | Stripped; empty raises `A defect title is required.` |
| `description` | string | no | |
| `location` | string | no | |
| `severity` | string | no | `low` / `medium` / `high` / `critical`. Default `medium`. Anything else raises `Invalid defect severity.` |
| `photo_before` | string | no | Base64, or a `data:` URI. Max 8 MiB of base64. |

Every other field is ignored — the whitelist is explicit in
`_apply_defect_create`. `assigned_user_id` is forced to the acting user and
cannot be set from the payload.

Result: `{"record_id": <id>, "reference": "<DEF-…>"}`

### `defect.progress`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `record_id` | integer | **yes** | |
| `action` | string | **yes** | `start` or `ready` only. Anything else raises `Offline defects may only be started or marked ready.` |

Calls `action_start()` or `action_ready()`. Closing and reopening a defect are
deliberately not available offline.

Result: `{"record_id": <id>, "state": "<new state>"}`

### `inspection.answer`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `answer_id` | integer | **yes** | A `construction.form.answer` id |
| `value` | varies | **yes** | Written to the field matching the question's type |
| `comment` | string | no | |

The target field is chosen from the question's `answer_type`:

| `answer_type` | Field written | Accepted `value` |
| --- | --- | --- |
| `yes_no` | `answer_yes_no` | `"yes"`, `"no"`, `"na"` — anything else raises `Invalid inspection answer.` |
| `text` | `answer_text` | string |
| `number` | `answer_number` | number |
| `date` | `answer_date` | `"YYYY-MM-DD"` |
| `photo`, `signature` | — | raises `Photo and signature answers must be completed online.` |

The parent inspection must be in `draft`, `in_progress` or `rejected`, else
`This inspection is no longer editable.`

Result: `{"record_id": <inspection id>, "answer_id": <id>}`

### `workorder.checklist`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `task_id` | integer | **yes** | A `facility.request.task` id |
| `done` | boolean | no | Coerced with `bool()`; absent means `False` |

Result: `{"record_id": <request id>, "task_id": <id>, "done": <bool>}`

### `workorder.note`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `record_id` | integer | **yes** | A `maintenance.request` id |
| `description` | string | no | **Replaces** the description; it is not appended |
| `labor_hours` | number | no | Must be 0–24, else `Daily labor hours must be between 0 and 24.` |

Result: `{"record_id": <id>, "write_date": "<new write_date>"}`

### `daily_log.create`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `project_id` | integer | **yes** | |
| `log_date` | string | no | Defaults to today in the **user's** timezone |
| `weather` | string | no | `sunny` / `cloudy` / `rain` / `storm` / `hot` / `windy`. Default `sunny`. Anything else raises `Invalid weather value.` |
| `temperature` | number | no | Default 0 |
| `notes` | string | no | |

Creates a draft `construction.daily.log` with `prepared_by_id` forced to the
acting user. Manpower, equipment, activity and delay lines cannot be created
offline — add them online afterwards.

Result: `{"record_id": <id>, "state": "draft"}`

### `asset.scan`

| Payload key | Type | Required | Notes |
| --- | --- | --- | --- |
| `equipment_id` | integer | **yes** | |
| `source` | string | no | Default `manual`. Coerced to `manual` if outside `qr`/`nfc`/`manual`. |

Calls `record_tag_scan`. Raises `This asset tag is not active.` if
`tag_status != "active"`.

Result: `{"record_id": <scan id>, "equipment_id": <id>}`

## Worked example

```python
"""Push a batch of offline operations and handle each outcome."""
import uuid

import requests

URL = "https://your-host"
session = requests.Session()

auth = session.post(
    f"{URL}/web/session/authenticate",
    json={"jsonrpc": "2.0", "method": "call", "params": {
        "db": "YOUR_DATABASE",
        "login": "YOUR_LOGIN",
        "password": "YOUR_API_KEY",
    }},
    timeout=30,
).json()
if "error" in auth:
    raise SystemExit(auth["error"])

snapshot = session.post(
    f"{URL}/majal/field/api/bootstrap",
    json={"jsonrpc": "2.0", "method": "call", "params": {}, "id": 1},
    timeout=60,
).json()["result"]

first_defect = snapshot["defects"][0]

operations = [
    {
        "client_uuid": uuid.uuid4().hex,
        "kind": "defect.create",
        "payload": {
            "project_id": snapshot["projects"][0]["id"],
            "name": "Chipped tile, L3 lobby grid C3",
            "description": "Two tiles cracked at the threshold.",
            "location": "Level 3 lobby",
            "severity": "medium",
        },
    },
    {
        "client_uuid": uuid.uuid4().hex,
        "kind": "defect.progress",
        "base_write_date": first_defect["write_date"],
        "payload": {"record_id": first_defect["id"], "action": "start"},
    },
]

response = session.post(
    f"{URL}/majal/field/api/sync",
    json={"jsonrpc": "2.0", "method": "call",
          "params": {"operations": operations}, "id": 2},
    timeout=120,
).json()

if "error" in response:
    raise SystemExit(response["error"]["data"]["message"])

for entry in response["result"]["results"]:
    if entry["status"] == "applied":
        print("ok", entry["client_uuid"], entry.get("result"))
    elif entry["status"] == "conflict":
        print("re-fetch and resubmit with a new uuid:", entry["client_uuid"])
    else:
        print("failed:", entry["client_uuid"], entry["result"].get("error"))
```

## The audit trail

Every operation is persisted as a `majal.offline.operation`, whether it applied
or not. All fields are `readonly=True`; the model is written by the sync handler
and is not meant to be created directly.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `client_uuid` | char | yes | yes | Indexed. Unique per user (`unique(client_uuid, user_id)`). |
| `user_id` | many2one `res.users` | yes | yes | Defaults to the acting user |
| `company_id` | many2one `res.company` | yes | yes | Defaults to `env.company` |
| `kind` | selection | yes | yes | The seven kinds above |
| `target_model` | char | no | yes | As supplied by the client; audit only |
| `target_id` | integer | no | yes | As supplied by the client; audit only |
| `base_write_date` | datetime | no | yes | As supplied |
| `payload` | json | yes | yes | The raw payload as received |
| `state` | selection | yes | yes | `received` / `applied` / `conflict` / `failed`. Default `received`. Indexed. |
| `result` | json | no | yes | The result or `{"error": "…"}` |
| `processed_at` | datetime | no | yes | |

`_sync_batch` is private and **not callable over RPC** —
`AccessError: Private methods (such as 'majal.offline.operation._sync_batch')
cannot be called remotely.` The HTTP route is the only way in.

## Limits

| Limit | Value | Enforced by |
| --- | --- | --- |
| Operations per batch | 100 | `_sync_batch`, raises |
| Photo payload | 8 MiB of base64 | `_decode_photo`, message says "smaller than 6 MB" |
| `client_uuid` length | 16–80 chars | `_validate_uuid`, raises |
| `labor_hours` | 0–24 | `_apply_workorder_note` |

The photo message and the limit disagree — the check is `len(value) > 8 * 1024 *
1024` on the base64 string, which is roughly 6 MB of decoded image. Size your
uploads against 6 MB of actual image data.

An upload can also fail before it reaches Odoo at all: a deployment fronted by
Cloudflare's free plan caps request bodies at **100 MB** and returns a 413 that
Odoo never sees or logs (`deploy/dns/README.md`).
