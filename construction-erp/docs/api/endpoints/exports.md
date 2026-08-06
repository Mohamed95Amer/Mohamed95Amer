# Exports and downloads

[← Endpoints](index.md) · [← Index](../index.md)

Two file-download routes. Both are `auth="user"` and read the session cookie —
see [Endpoints → Authentication](index.md#authentication-for-authuser-routes).

## `GET /majal/sheets/<int:sheet_id>/export.csv`

Source: `custom-addons/majal_documents/controllers/sheet_export.py`

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | `user` |
| `methods` | `GET` |

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `sheet_id` | path | yes | A `majal.sheet` id |

### Response

| Header | Value |
| --- | --- |
| `Content-Type` | `text/csv; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="<reference>.csv"` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-store` |

The body is UTF-8 with a **BOM** (`﻿`) prefix so Excel opens it correctly.
Strip it if you are parsing the file yourself:

```python
text = response.content.decode("utf-8-sig")
```

Columns, in order:

```
Code, Description, Unit, Quantity, Unit Rate, Amount, Note
```

Lines are ordered by `(sequence, id)`. A final row is appended:
`"", "TOTAL", "", "", "", <amount_total>, ""`.

The filename is `sheet.reference` with every character outside `[A-Za-z0-9_.-]`
replaced by `-`, falling back to `sheet`.

### Failure modes

| Situation | Result |
| --- | --- |
| Not logged in | Redirect to `/web/login` |
| No sheet with that id, **or** the sheet is outside the user's record rules | `request.not_found()` → **HTTP 404** |

The lookup is `search([("id", "=", sheet_id)], limit=1)` as the acting user, so an
inaccessible sheet and a nonexistent one are the same 404.

### CSV injection

Text cells (`code`, `description`, `unit`, `note`) beginning with `=`, `+`, `-`
or `@` are prefixed with a single quote by `_safe_csv`, so a spreadsheet does not
evaluate them as formulas. If you re-export the data, keep doing this.

### Example

```python
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

response = session.get(f"{URL}/majal/sheets/17/export.csv", timeout=60)
if response.status_code == 404:
    raise SystemExit("No such sheet, or no access to it")
response.raise_for_status()

import csv
import io

reader = csv.reader(io.StringIO(response.content.decode("utf-8-sig")))
for row in reader:
    print(row)
```

```bash
curl -sS -b cookies.txt -o sheet.csv \
  https://your-host/majal/sheets/17/export.csv
```

### Or read the lines over RPC instead

Usually better — you get types rather than strings, and you can filter:

```python
lines = models.execute_kw(
    DB, uid, API_KEY, "majal.sheet.line", "search_read",
    [[["sheet_id", "=", 17]]],
    {"fields": ["sequence", "code", "description", "unit",
                "quantity", "unit_rate", "amount", "note"],
     "order": "sequence, id"},
)
```

`majal.sheet.action_export_csv()` is a public method, but it returns an
`ir.actions.act_url` pointing at this route — it does not return the file.

## `GET /majal/administration/backups/<int:snapshot_id>/download`

Source: `custom-addons/majal_administration/controllers/backup_download.py`

Downloads a verified database-and-filestore recovery archive.

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | `user` |
| `methods` | `GET` |
| `csrf` | **`False`** |

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `snapshot_id` | path | yes | A `majal.backup.snapshot` id |

### Authorisation

Requires `majal_administration.group_platform_owner`. Anyone else:

```
AccessError: Only a Platform Owner can export recovery archives.
```

This is an explicit `has_group` check in the controller, not a record rule.

### Preconditions, and what each failure says

| Condition | Exception |
| --- | --- |
| Caller is not a Platform Owner | `AccessError: Only a Platform Owner can export recovery archives.` |
| Snapshot missing, or `state != "verified"` | `UserError: This recovery point is not available for download.` |
| Archive file missing on disk, or its SHA-256 does not match `snapshot.checksum` | `UserError: The recovery archive failed its download integrity check.` |

The checksum is recomputed on every download. A corrupted or tampered archive is
refused rather than served.

### Response

| Header | Value |
| --- | --- |
| `Content-Type` | `application/zip` |
| `Content-Length` | the archive size |
| `Content-Disposition` | `attachment; filename="majal-<database>-<YYYYmmdd-HHMMSS>.zip"` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `no-store` |

Streamed with `direct_passthrough`, so archives larger than memory are fine at
the Odoo end. A reverse proxy may still impose its own limits — a Cloudflare
free-plan proxy caps request bodies at 100 MB, and while that cap is on uploads
rather than downloads, large archives through any proxy deserve a timeout budget
(`deploy/dns/README.md`).

> **This route is `csrf=False` and authenticated purely by session cookie.** It
> is a `GET`, so browser CSRF is not the exposure — but any page that can cause a
> Platform Owner's browser to issue a cross-site GET can cause the archive to be
> fetched. Treat the Platform Owner session as high-value and do not reuse it for
> ordinary browsing. Integrations should not automate this endpoint; use the
> deployment's own off-machine replication instead.

### `majal.backup.snapshot`

Every field is `readonly=True`; snapshots are created by cron and by
`create_recovery_point()`.

| Field | Type | Readonly | Description |
| --- | --- | --- | --- |
| `name` | char | yes | |
| `slot` | selection | yes | Which of the seven rotating recovery tiers. Indexed. |
| `slot_label` | char | **computed** | Human-readable slot name |
| `slot_sequence` | integer | **computed, stored** | Ordering |
| `state` | selection | yes | `empty` / `pending` / `verified` / `error`. Only `verified` may be downloaded. Indexed. |
| `backup_date` | datetime | yes | Indexed |
| `database_name` | char | yes | |
| `archive_name` | char | yes | |
| `checksum` | char | yes | SHA-256 of the archive |
| `size_bytes` | integer | yes | |
| `size_display` | char | **computed** | |
| `age_display` | char | **computed** | |
| `verified_at` | datetime | yes | |
| `created_by_id` | many2one `res.users` | yes | |
| `release_version` | char | yes | |
| `module_count` | integer | yes | |
| `error_message` | text | yes | |
| `company_id` | many2one `res.company` | yes | Required; defaults to `env.company` |

Public methods: `create_recovery_point()`, `action_verify()`,
`action_create_now()`, `action_download()`, `action_prepare_restore()`.
`action_download()` returns an `ir.actions.act_url` for this route.

Restoring is deliberately **not** an API. It requires a short-lived
`majal.restore.request` raised by a Platform Owner plus a separate offline action
by a deployment operator. `majal.restore.request.token_hash` is a secret.
