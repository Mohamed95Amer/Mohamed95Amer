# XML-RPC

[← Index](index.md)

XML-RPC is the primary integration surface. It exposes the whole ORM: every Majal
model, every stored field, and every public method.

## Endpoints

| Path | Fault codes | Notes |
| --- | --- | --- |
| `https://your-host/xmlrpc/2/<service>` | integers | Use this one. |
| `https://your-host/xmlrpc/<service>` | strings | Historical and non-compliant; kept for backwards compatibility. |

Both routes are `auth="none"`, `methods=["POST"]`, `csrf=False`, `save_session=False`
(`vendor/odoo/odoo/addons/base/controllers/rpc.py`). Credentials travel in the call
arguments, not in a cookie, so there is no session and no CSRF token to manage.

`<service>` is one of `common`, `object`, `db`. Majal deployments disable database
management, so treat `db` as unavailable.

## The `common` service

| Method | Arguments | Returns |
| --- | --- | --- |
| `version()` | — | dict: `server_version`, `server_version_info`, `server_serie`, `protocol_version` |
| `authenticate(db, login, password, user_agent_env)` | `user_agent_env` may be `{}` | integer `uid`, or `False` |
| `login(db, login, password)` | — | integer `uid`, or `False` |
| `about(extended=False)` | — | version string |

`authenticate` returns `False` rather than raising on bad credentials
(`odoo/service/common.py`, `exp_authenticate`). `password` is your API key.

```python
import xmlrpc.client

URL = "https://your-host"
DB = "YOUR_DATABASE"
LOGIN = "YOUR_LOGIN"
API_KEY = "YOUR_API_KEY"

common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common")
uid = common.authenticate(DB, LOGIN, API_KEY, {})
if not uid:
    raise SystemExit("Authentication failed")
```

## The `object` service

Two methods: `execute` and `execute_kw`. Always use `execute_kw` — `execute`
cannot pass keyword arguments such as `limit`, `offset`, `order` or `context`.

```
execute_kw(db, uid, password, model, method, positional_args, keyword_args={})
```

- `positional_args` is a **list**, even for a single argument.
- `keyword_args` is a dict and is optional.

```python
models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object")

ids = models.execute_kw(
    DB, uid, API_KEY,
    "construction.rfi", "search",
    [[["state", "=", "submitted"]]],            # positional: one domain
    {"limit": 20, "order": "date_required asc, id desc"},
)
```

Note the double bracket: the domain is the first positional argument, so it is
wrapped in the positional list.

## The CRUD verbs

| Method | Positional | Keyword | Returns |
| --- | --- | --- | --- |
| `search` | `[domain]` | `offset`, `limit`, `order`, `context` | list of ids |
| `search_count` | `[domain]` | `limit`, `context` | integer |
| `search_read` | `[domain]` | `fields`, `offset`, `limit`, `order`, `context` | list of dicts |
| `read` | `[ids]` | `fields`, `context` | list of dicts (always includes `id`) |
| `read_group` | `[domain, fields, groupby]` | `offset`, `limit`, `orderby`, `lazy` | list of group dicts |
| `create` | `[vals]` or `[[vals, vals, …]]` | `context` | id, or list of ids |
| `write` | `[ids, vals]` | `context` | `True` |
| `unlink` | `[ids]` | `context` | `True` |
| `copy` | `[id]` | `default`, `context` | new id |
| `fields_get` | `[]` or `[field_names]` | `attributes` | dict of field definitions |
| `name_search` | `[]` | `name`, `args`, `operator`, `limit` | list of `[id, name]` |
| `check_access` | `["read"\|"write"\|"create"\|"unlink"]` | — | `None`, or raises `AccessError` |
| `default_get` | `[field_names]` | `context` | dict of defaults |

`create` with a list of dicts performs a multi-create and returns a list of ids.

### Read a project and its BOQ

```python
project_ids = models.execute_kw(
    DB, uid, API_KEY, "project.project", "search",
    [[["is_construction", "=", True], ["project_code", "=", "P-0001"]]],
    {"limit": 1},
)
if not project_ids:
    raise SystemExit("No such project")
project_id = project_ids[0]

boqs = models.execute_kw(
    DB, uid, API_KEY, "construction.boq", "search_read",
    [[["project_id", "=", project_id]]],
    {"fields": ["name", "version", "state", "amount_sell_total",
                "amount_cost_total", "currency_id"],
     "order": "version desc"},
)
for boq in boqs:
    print(boq["name"], boq["version"], boq["state"], boq["amount_sell_total"])
```

### Create an RFI

```python
rfi_id = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "create",
    [{
        "name": "Clarification: slab rebar spacing at grid C3",
        "project_id": project_id,
        "question": "<p>Drawing S-201 Rev B shows 150 c/c; the spec says 200 c/c.</p>",
        "discipline": "structural",
        "date_required": "2026-08-14",
        "cost_impact": True,
    }],
)
models.execute_kw(DB, uid, API_KEY, "construction.rfi", "action_submit", [[rfi_id]])
```

`reference` is assigned by the server (`construction.document.mixin._next_reference`)
and is `readonly` — do not send it.

### Create a BOQ with sections and lines in one call

```python
boq_id = models.execute_kw(
    DB, uid, API_KEY, "construction.boq", "create",
    [{
        "name": "Bill of Quantities",
        "project_id": project_id,
        "line_ids": [
            (0, 0, {"name": "Blockwork 200mm", "item_code": "03.100",
                    "quantity": 1250.0, "unit_rate": 68.0,
                    "cost_material": 31.0, "cost_labour": 14.0}),
            (0, 0, {"name": "Screed 50mm", "item_code": "03.200",
                    "quantity": 3400.0, "unit_rate": 22.0,
                    "cost_material": 9.5, "cost_labour": 6.0}),
        ],
    }],
)
```

`amount_sell_total`, `amount_cost_total`, `margin_percent` and every `amount_*` on
the lines are computed. Sending them is silently ignored.

## Calling business methods

Any public method on a Majal model is callable. Pass the recordset ids as the first
positional argument, wrapped in a list:

```python
models.execute_kw(DB, uid, API_KEY, "construction.permit", "action_submit", [[permit_id]])
models.execute_kw(DB, uid, API_KEY, "construction.boq", "action_approve", [[boq_id]])
```

Methods that take arguments append them to the positional list:

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.approval.step", "action_reject",
    [[step_id], "Rates not agreed with the QS."],
)
```

`@api.model` helpers are called with an empty id list:

```python
payload = models.execute_kw(
    DB, uid, API_KEY, "construction.bim.model", "viewer_payload", [[], model_id],
)
```

Methods whose name starts with `_` are refused — see
[Conventions → Private methods](conventions.md#private-methods-are-not-callable).

## Passing context

`context` is a keyword argument on almost every ORM method:

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.daily.log", "create",
    [{"project_id": project_id}],
    {"context": {"lang": "ar_001", "tz": "Asia/Riyadh",
                 "allowed_company_ids": [1]}},
)
```

`allowed_company_ids` must be a subset of the user's companies or the call raises
`AccessError: Access to unauthorized or invalid companies.` — see
[Conventions → Multi-company](conventions.md#multi-company).

## Transactions

Each `execute_kw` call is one database transaction. It commits on return and rolls
back entirely on any exception: a `create` with 200 lines either lands whole or not
at all. There is no way to span two calls in one transaction over RPC — if you need
atomicity across several operations, express them as one call (nested `Command`
tuples, or a single business method).

Odoo retries a call up to five times internally on Postgres serialisation or
deadlock failures (`odoo/service/model.py`, `MAX_TRIES_ON_CONCURRENCY_FAILURE`)
before surfacing the error, so a contended write may be slow rather than failing.

## Error handling

Every failure arrives as `xmlrpc.client.Fault`. On `/xmlrpc/2/` the `faultCode` is
an integer:

| `faultCode` | Meaning |
| --- | --- |
| `1` | Application error — `faultString` is a full Python traceback |
| `2` | `UserError` or `RedirectWarning` — the message is meant for a human |
| `3` | `AccessDenied` — bad credentials |
| `4` | `AccessError` — authenticated but not permitted |

```python
import xmlrpc.client

try:
    models.execute_kw(
        DB, uid, API_KEY, "construction.approval.step", "write",
        [[step_id], {"state": "approved"}],
    )
except xmlrpc.client.Fault as fault:
    print(fault.faultCode, fault.faultString)
    # 4  Approval decisions can only be recorded through Approve or Reject.
```

See [Errors](errors.md) for the full mapping and the Majal-specific messages.

## Next

- [JSON-RPC](jsonrpc.md)
- [Errors](errors.md)
- [Approvals](approvals.md)
- [Models](models/index.md)
