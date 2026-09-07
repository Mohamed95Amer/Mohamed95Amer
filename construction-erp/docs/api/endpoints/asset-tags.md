# Asset tags (QR / NFC)

[← Endpoints](index.md) · [← Index](../index.md)

Source: `custom-addons/facility_asset/controllers/asset_tag.py`

Two routes. A technician scans a physical QR code or taps an NFC tag on a piece of
plant; the tag resolves to a landing page, and confirming records a scan event.

> **`tag_token` is a secret.** It is the tag credential and it is embedded in
> every tag URL. See [Security → Secrets](../security.md#secrets-in-the-data-model)
> before exposing an asset record to another system.

## `GET /majal/asset/<string:token>/<string:source>`

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | `user` |
| `website` | `True` — renders `facility_asset.asset_tag_landing` |
| `methods` | `GET` |

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `token` | path | yes | The asset's `tag_token` |
| `source` | path | yes | Exactly `qr` or `nfc`. Anything else raises `NotFound` (HTTP 404). |

Returns an HTML page. It is not a JSON API and has no machine-readable form.

### Resolution and failure modes

The controller searches `maintenance.equipment` for
`tag_token = <token>` **and** `tag_status = "active"`. No match raises
`werkzeug.exceptions.NotFound` → **HTTP 404**.

That search runs as the authenticated user, so record rules apply. A token that is
valid but belongs to an asset the user cannot see is indistinguishable from a token
that does not exist — both are 404. This is intentional.

| Situation | Result |
| --- | --- |
| Not logged in | Odoo redirects to `/web/login` (standard `auth="user"` behaviour) |
| `source` not `qr` or `nfc` | 404 |
| No asset with that token | 404 |
| `tag_status` is `missing` or `retired` | 404 |
| Asset outside the user's record rules | 404 |
| Everything valid | 200, landing page with a link into the backend |

## `POST /majal/asset/<string:token>/<string:source>/confirm`

| Property | Value |
| --- | --- |
| `type` | `http` |
| `auth` | `user` |
| `website` | `True` |
| `methods` | `POST` |
| `csrf` | **`True`** — explicitly enabled |

Same path parameters and the same 404 conditions. On success it calls
`asset.record_tag_scan(source)` and issues a 303 redirect into the backend form
for that asset.

Because `csrf=True`, a POST must carry the `csrf_token` field rendered into the
landing page's form. There is no way to call this endpoint without first fetching
the landing page in the same session. It is a browser flow.

## Record a scan from an integration instead

Do not drive the HTTP routes. Two supported paths:

### Over RPC — `record_tag_scan`

```python
"""Record an asset scan over XML-RPC."""
import xmlrpc.client

URL = "https://your-host"
DB = "YOUR_DATABASE"
LOGIN = "YOUR_LOGIN"
API_KEY = "YOUR_API_KEY"

common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common")
models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object")
uid = common.authenticate(DB, LOGIN, API_KEY, {})

asset_ids = models.execute_kw(
    DB, uid, API_KEY, "maintenance.equipment", "search",
    [[["barcode", "=", "AST-00042"]]], {"limit": 1},
)
scan_id = models.execute_kw(
    DB, uid, API_KEY, "maintenance.equipment", "record_tag_scan",
    [asset_ids, "manual"],
)
```

`record_tag_scan(source="manual")` is public and callable. It:

1. `ensure_one()` — call it on a single asset.
2. `check_access("read")` — raises `AccessError` if the user cannot read the asset.
3. Rejects a `source` outside `{"qr", "nfc", "manual"}` by silently coercing it to
   `"manual"`.
4. Raises `AccessError: This asset tag is not active.` if `tag_status != "active"`.
5. Creates a `facility.asset.scan` and returns it.
6. Updates `last_scan_at`, `last_scan_user_id`, `last_scan_source` on the asset
   with an internal elevated write — so a read-only technician can scan without
   holding edit rights on the equipment register.

### Over the offline sync API

`kind: "asset.scan"` in a `/majal/field/api/sync` batch. See
[Field app](field-app.md#assetscan).

## `facility.asset.scan`

Append-only evidence. Every field is `readonly=True`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `equipment_id` | many2one `maintenance.equipment` | yes | yes | `ondelete="cascade"`, indexed |
| `scanned_at` | datetime | yes | yes | Defaults to now (UTC) |
| `user_id` | many2one `res.users` | yes | yes | Defaults to the acting user |
| `source` | selection | yes | yes | `qr` / `nfc` / `manual`. Default `manual`. |
| `facility_location_id` | many2one `facility.location` | no | yes | Copied from the asset at scan time |
| `company_id` | many2one `res.company` | — | yes | **related, stored** — `equipment_id.company_id` |

Scans cannot be edited or deleted through the ORM
(`_unlink_except_uninstall`). Read them for a movement history:

```python
history = models.execute_kw(
    DB, uid, API_KEY, "facility.asset.scan", "search_read",
    [[["equipment_id", "=", asset_ids[0]]]],
    {"fields": ["scanned_at", "user_id", "source", "facility_location_id"],
     "order": "scanned_at desc", "limit": 50},
)
```

## Tag fields on `maintenance.equipment`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `tag_token` | char | no | **yes** | **Secret.** `secrets.token_urlsafe(24)`, unique, `copy=False`, indexed. Generated on create. |
| `tag_status` | selection | yes | no | `active` / `missing` / `retired`. Default `active`, tracked. Only `active` resolves. |
| `nfc_uid` | char | no | no | Optional hardware UID read from the physical tag. `copy=False`, tracked. |
| `qr_tag_url` | char | — | **computed** | `/web/login?db=…&redirect=/majal/asset/<token>/qr`. **Embeds the token.** |
| `nfc_tag_url` | char | — | **computed** | Same, with `/nfc`. **Embeds the token.** |
| `qr_tag_encoded_url` | char | — | **computed** | `qr_tag_url` URL-encoded, for embedding in a QR generator. **Embeds the token.** |
| `scan_ids` | one2many `facility.asset.scan` | — | no | Scan history |
| `scan_count` | integer | — | **computed** | |
| `last_scan_at` | datetime | no | yes | `copy=False` |
| `last_scan_user_id` | many2one `res.users` | no | yes | `copy=False` |
| `last_scan_source` | selection | no | yes | `copy=False` |
| `barcode` | char | no | no | Human-readable asset code. Unique SQL constraint, `copy=False`, auto-filled from the `facility.asset.tag` sequence on create. |

The tag URLs deliberately route through `/web/login` with an explicit `db` and a
same-site `redirect`. A phone scanning a physical label usually has no session, so
the tag selects the database, authenticates the technician, and then resumes the
scan. That is why the token appears in a URL at all — and why the URL must not be
treated as public.

### Rotating a token

```python
models.execute_kw(
    DB, uid, API_KEY, "maintenance.equipment", "action_rotate_tag_token",
    [asset_ids],
)
```

Requires `maintenance.group_equipment_manager`, else
`AccessError: Only facility managers can replace asset tags.`

Rotation invalidates every printed QR and programmed NFC tag for that asset
immediately. The physical labels must be reprinted. Do this when a tag is
believed compromised — and treat "the token leaked into another system" as
compromised.

Use `action_rotate_tag_token` rather than writing the field. `tag_token` is
`readonly=True`, but in Odoo `readonly` is a client-side hint — it does **not**
block a write over RPC. A direct `write({"tag_token": ...})` by a user with write
access on `maintenance.equipment` succeeds, silently invalidates every printed
tag for that asset, and skips both the group check and the warning notification
that `action_rotate_tag_token` produces. It will also raise
`Every asset must have a unique secure tag token.` if the value collides.
