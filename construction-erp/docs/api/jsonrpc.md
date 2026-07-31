# JSON-RPC

[← Index](index.md)

JSON-RPC exposes exactly the same ORM as [XML-RPC](xmlrpc.md). Choose it when you
would rather not marshal XML, or when your language has no XML-RPC client.

There are two distinct entry points, and they authenticate differently.

| Path | Auth | Use for |
| --- | --- | --- |
| `/jsonrpc` | credentials in the payload | server-to-server integrations |
| `/web/dataset/call_kw` | session cookie | anything already logged into the web client |

## `/jsonrpc`

`@route('/jsonrpc', type='json', auth="none", save_session=False)`
(`vendor/odoo/odoo/addons/base/controllers/rpc.py`). Stateless — no cookie is set
and none is read.

### Envelope

```json
{
  "jsonrpc": "2.0",
  "method": "call",
  "params": {"service": "object", "method": "execute_kw", "args": [...]},
  "id": 1
}
```

`method` at the top level is always the literal string `"call"`. The real call is
`params.service` + `params.method` + `params.args`, mirroring the XML-RPC services
`common`, `object` and `db`.

The response is either:

```json
{"jsonrpc": "2.0", "id": 1, "result": ...}
```

or

```json
{"jsonrpc": "2.0", "id": 1,
 "error": {"code": 200, "message": "Odoo Server Error",
           "data": {"name": "odoo.exceptions.AccessError",
                    "message": "...", "arguments": ["..."], "debug": "traceback..."}}}
```

**The HTTP status is 200 even when `error` is present.** Check for the `error` key;
`raise_for_status()` alone will not catch a failed call.

### Complete client

```python
"""Minimal JSON-RPC client for Majal."""
import requests

URL = "https://your-host"
DB = "YOUR_DATABASE"
LOGIN = "YOUR_LOGIN"
API_KEY = "YOUR_API_KEY"


class MajalError(RuntimeError):
    def __init__(self, error):
        data = error.get("data") or {}
        self.name = data.get("name", "")
        self.debug = data.get("debug", "")
        super().__init__(data.get("message") or error.get("message") or "RPC error")


def rpc(service, method, args, session=requests.Session()):
    response = session.post(
        f"{URL}/jsonrpc",
        json={"jsonrpc": "2.0", "method": "call", "id": 1,
              "params": {"service": service, "method": method, "args": args}},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise MajalError(payload["error"])
    return payload["result"]


def call(model, method, args, kwargs=None):
    return rpc("object", "execute_kw",
               [DB, UID, API_KEY, model, method, args, kwargs or {}])


UID = rpc("common", "login", [DB, LOGIN, API_KEY])
if not UID:
    raise SystemExit("Authentication failed")

defects = call(
    "construction.defect", "search_read",
    [[["state", "in", ["open", "reopened"]], ["severity", "=", "critical"]]],
    {"fields": ["reference", "name", "project_id", "location", "date_required"],
     "limit": 50, "order": "id desc"},
)
for defect in defects:
    print(defect["reference"], defect["name"])
```

### curl

```bash
curl -sS https://your-host/jsonrpc \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "call",
    "id": 1,
    "params": {
      "service": "object",
      "method": "execute_kw",
      "args": ["YOUR_DATABASE", 2, "YOUR_API_KEY",
               "construction.rfi", "search_count",
               [[["state", "=", "submitted"]]]]
    }
  }'
```

The `2` is the `uid` returned by `common.login`. Look it up first:

```bash
curl -sS https://your-host/jsonrpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"call","id":1,
       "params":{"service":"common","method":"login",
                 "args":["YOUR_DATABASE","YOUR_LOGIN","YOUR_API_KEY"]}}'
```

## `/web/dataset/call_kw`

`@http.route(['/web/dataset/call_kw', '/web/dataset/call_kw/<path:path>'],
type='json', auth="user")` (`vendor/odoo/addons/web/controllers/dataset.py`).

This is what the web client itself uses. It requires a **session cookie**, not
credentials in the body, so you must log in through `/web/session/authenticate`
first and keep the `session_id` cookie.

```python
import requests

URL = "https://your-host"
session = requests.Session()

login = session.post(
    f"{URL}/web/session/authenticate",
    json={"jsonrpc": "2.0", "method": "call", "params": {
        "db": "YOUR_DATABASE", "login": "YOUR_LOGIN", "password": "YOUR_API_KEY"}},
    timeout=30,
)
result = login.json()
if "error" in result:
    raise SystemExit(result["error"])

response = session.post(
    f"{URL}/web/dataset/call_kw",
    json={"jsonrpc": "2.0", "method": "call", "params": {
        "model": "maintenance.request",
        "method": "search_read",
        "args": [[["sla_breached", "=", True]]],
        "kwargs": {"fields": ["name", "sla_resolution_deadline", "stage_id"],
                   "limit": 20},
    }},
    timeout=60,
)
print(response.json()["result"])
```

Note the shape difference: `params` here carries `model`, `method`, `args` and
`kwargs` as named keys — it is **not** the `execute_kw` positional list.

### Why you probably want `/jsonrpc` instead

- Sessions expire and must be renewed; API keys do not (until their expiry date).
- Session login is subject to the same MFA behaviour as the web client.
- `call_kw` routes marked `readonly` may be dispatched to a read-only database
  replica in deployments that configure one.

`/web/dataset/call_button` exists alongside it and returns the action dictionary a
button produces. It is a UI convenience; for integrations, call the method itself.

## Majal's own JSON routes

Two of Majal's custom controllers are `type="json"` and follow the same envelope,
but they are **not** on `/jsonrpc` — they are their own paths and require an
authenticated session (`auth="user"`):

- `POST /majal/field/api/bootstrap`
- `POST /majal/field/api/sync`

See Endpoints → Offline field app.

## Next

- [Errors](errors.md)
- [Conventions](conventions.md)
- Custom endpoints
