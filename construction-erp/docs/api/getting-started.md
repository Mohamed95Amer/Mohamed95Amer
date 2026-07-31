# Getting started

[← Index](index.md)

## Base URLs

Majal is a single Odoo 18 deployment. Everything is served from one origin.

| Purpose | Path |
| --- | --- |
| XML-RPC (int fault codes — use this one) | `https://your-host/xmlrpc/2/<service>` |
| XML-RPC (legacy, string fault codes) | `https://your-host/xmlrpc/<service>` |
| JSON-RPC | `https://your-host/jsonrpc` |
| Web session ORM calls | `https://your-host/web/dataset/call_kw` |
| Majal custom controllers | `https://your-host/majal/...`, `/my/...`, `/whatsapp/webhook` |

The three services reachable over RPC are `common`, `object` and `db`
(`odoo/addons/base/controllers/rpc.py` routes `/xmlrpc/2/<service>` to
`dispatch_rpc`). Integrations use `common` (login/version) and `object`
(`execute` / `execute_kw`). `db` is disabled in a Majal deployment — see below.

## Database selection

Majal ships as a single-database product. `majal_branding` overrides Odoo's
database manager routes:

- `GET /web/database/selector` → 303 redirect to `/web/login?db=<configured db>`
- `GET /web/database/manager` → same redirect

Both are `auth="none"`. There is no database list to enumerate and no browser
database manager. Your integration must know the database name up front; it is
whatever `db_name` is set to in `odoo.conf` (`erp` in the shipped Docker profile).

## Authentication

Odoo authenticates every RPC call with the triple `(database, uid, password)`.
The "password" may be either the account password or a **developer API key**.
Use an API key.

### Why an API key rather than a password

`majal_security` depends on `auth_totp_mail_enforce`. When a user has MFA enabled,
`res.users._rpc_api_keys_only()` returns `True` and **password authentication over
RPC stops working entirely** — only an API key is accepted
(`odoo/addons/base/models/res_users.py`, `APIKeysUser._check_credentials`).
An integration built on a password will break the day the account enrols in 2FA.

### Generating an API key

There is no API to mint a key; it is a UI action, deliberately, because it is
gated behind an identity check.

1. Sign in as the integration user.
2. Open **Preferences → Account Security → New API Key**
   (`res.users.api_key_wizard`).
3. Confirm your identity, name the key, set an expiration date.
4. Copy the key. It is shown once — only a hash and a short index prefix are stored
   (`res.users.apikeys` is `_auto = False` with a secret `key` column).

Constraints enforced by `res.users.apikeys._check_expiration_date`:

| Rule | Behaviour |
| --- | --- |
| Non-system users **must** set an expiration date | `ValidationError: The API key must have an expiration date` |
| Duration is capped by the maximum `api_key_duration` across the user's groups | `ValidationError: You cannot exceed <n> days.` |
| System users may create a non-expiring key | Allowed |
| Expired keys stop authenticating | Silently rejected in the credential SQL |

Keys created through the wizard have `scope = NULL` (global), which is what RPC
requires — `_check_credentials(scope='rpc', ...)` matches only `scope IS NULL` or
an exact `'rpc'` scope.

### Rotating and revoking

A user may delete their own keys; a system user may delete anyone's
(`res.users.apikeys._remove`, else `AccessError: You can not remove API keys unless
they're yours or you are a system user`). Deleting a key takes effect immediately.

## Your first call — XML-RPC

```python
"""Authenticate and count Majal construction projects."""
import xmlrpc.client

URL = "https://your-host"
DB = "YOUR_DATABASE"
LOGIN = "YOUR_LOGIN"
API_KEY = "YOUR_API_KEY"

common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common")
print(common.version())

uid = common.authenticate(DB, LOGIN, API_KEY, {})
if not uid:
    raise SystemExit("Authentication failed")

models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object")
count = models.execute_kw(
    DB, uid, API_KEY,
    "project.project", "search_count",
    [[["is_construction", "=", True]]],
)
print(f"{count} construction projects")
```

`common.authenticate` returns the integer `uid`, or `False` on failure — it does not
raise (`odoo/service/common.py`, `exp_authenticate`). Hold on to `uid`; you pass it
plus the same key on every subsequent call. There is no session and nothing expires
between calls other than the key itself.

## Your first call — JSON-RPC

```python
"""Same call over JSON-RPC, with requests."""
import requests

URL = "https://your-host"
DB = "YOUR_DATABASE"
LOGIN = "YOUR_LOGIN"
API_KEY = "YOUR_API_KEY"


def jsonrpc(service, method, args):
    response = requests.post(
        f"{URL}/jsonrpc",
        json={
            "jsonrpc": "2.0",
            "method": "call",
            "params": {"service": service, "method": method, "args": args},
            "id": 1,
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload["result"]


uid = jsonrpc("common", "login", [DB, LOGIN, API_KEY])
count = jsonrpc(
    "object", "execute_kw",
    [DB, uid, API_KEY, "project.project", "search_count",
     [[["is_construction", "=", True]]]],
)
print(f"{count} construction projects")
```

## Checking what your user may do

Before building, confirm the integration user's effective rights. `check_access`
raises `AccessError` when refused and returns `None` when allowed:

```python
models.execute_kw(DB, uid, API_KEY, "construction.boq", "check_access", ["write"])
```

To see the fields you can actually read on a model:

```python
fields = models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "fields_get",
    [], {"attributes": ["string", "type", "required", "readonly", "relation",
                        "selection", "store"]},
)
```

`fields_get` is authoritative for the deployment you are talking to — the field
tables in these docs describe the shipped source, but a client may have added
studio fields on top.

## Rate and size limits

There is no application-level rate limiter in Majal. The practical limits are:

| Limit | Where it comes from | Effect |
| --- | --- | --- |
| **100 MB upload cap** when fronted by Cloudflare's free plan | `deploy/dns/README.md` | An IFC model or drawing set over 100 MB fails with a **413 from Cloudflare**, which Odoo never sees or logs. Deployments that need large uploads keep that hostname DNS-only or unproxied. |
| Offline sync batch size | `majal.offline.operation._sync_batch` | More than 100 operations in one call raises `ValidationError: Sync batches may contain at most 100 operations.` |
| Offline photo size | `majal.offline.operation._decode_photo` | Base64 payload over 8 MiB raises `ValidationError: Offline photos must be smaller than 6 MB.` |
| Worker request recycling | production `odoo.conf` | Long-running connections are recycled; retry idempotent requests. |

Odoo also retries transactions internally on Postgres serialisation/deadlock
failures up to five times before surfacing the error, so a concurrent writer may
make a call take noticeably longer rather than fail.

## Next

- [Conventions](conventions.md) — domains, pagination, dates, multi-company
- [XML-RPC reference](xmlrpc.md)
- Approvals — read this before writing to any approvable document
