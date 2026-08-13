# Custom endpoints

[← Index](../index.md)

Every `@http.route` defined by Majal's own addons. There are 30 route declarations
across 11 controller files, and this is the complete list — if a path is not here,
it does not exist in the product.

```
grep -rn "@http.route" custom-addons/ --include=*.py
```

Anything outside these paths is stock Odoo (`/web/...`, `/my/...` from the base
`portal` addon, `/xmlrpc/...`, `/jsonrpc`).

## Complete route table

| Path | Methods | `type` | `auth` | CSRF | Controller |
| --- | --- | --- | --- | --- | --- |
| `/majal/asset/<token>/<source>` | GET | http | user | default | [Asset tags](asset-tags.md) |
| `/majal/asset/<token>/<source>/confirm` | POST | http | user | **on** (`csrf=True`) | [Asset tags](asset-tags.md) |
| `/majal/field`, `/majal/field/` | GET | http | user | default | [Field app](field-app.md) |
| `/majal/field/service-worker.js` | GET | http | user | default | [Field app](field-app.md) |
| `/majal/field/api/bootstrap` | POST | **json** | user | n/a | [Field app](field-app.md) |
| `/majal/field/api/sync` | POST | **json** | user | n/a | [Field app](field-app.md) |
| `/my/rfis`, `/my/rfis/page/<int:page>` | any | http | user | default | [Portal](portal.md) |
| `/my/rfi/<int:rfi_id>` | any | http | user | default | [Portal](portal.md) |
| `/my/defects`, `/my/defects/page/<int:page>` | any | http | user | default | [Portal](portal.md) |
| `/my/defect/<int:defect_id>` | any | http | user | default | [Portal](portal.md) |
| `/my/defect/<int:defect_id>/ready` | POST | http | user | default | [Portal](portal.md) |
| `/my/subcontracts`, `/my/subcontracts/page/<int:page>` | any | http | user | default | [Portal](portal.md) |
| `/my/subcontract/<int:sub_id>` | any | http | user | default | [Portal](portal.md) |
| `/my/facility/requests`, `/my/facility/requests/page/<int:page>` | any | http | user | default | [Portal](portal.md) |
| `/my/facility/request/<int:request_id>` | any | http | user | default | [Portal](portal.md) |
| `/my/facility/request/new` | any | http | user | default | [Portal](portal.md) |
| `/my/facility/request/submit` | POST | http | user | default | [Portal](portal.md) |
| `/my/reservations`, `/my/reservations/page/<int:page>` | any | http | user | default | [Portal](portal.md) |
| `/my/reservation/<int:reservation_id>` | any | http | **public** | default | [Portal](portal.md) |
| `/majal/sheets/<int:sheet_id>/export.csv` | GET | http | user | default | [Exports](exports.md) |
| `/majal/administration/backups/<int:snapshot_id>/download` | GET | http | user | **off** (`csrf=False`) | [Exports](exports.md) |
| `/majal/health` | GET | http | **none** | **off** | [Health](health.md) |
| `/majal/health/deep` | GET | http | user + Platform Monitor | **off** | [Health](health.md) |
| `/majal/legal/open-source` | GET | http | **public** | default | [Public pages](public-pages.md) |
| `/majal/about` | GET | http | **public** | default | [Public pages](public-pages.md) |
| `/majal/help` | GET | http | **public** | default | [Public pages](public-pages.md) |
| `/web/database/selector` | any | http | **none** | default | [Public pages](public-pages.md) |
| `/web/database/manager` | any | http | **none** | default | [Public pages](public-pages.md) |
| `/whatsapp/webhook` | GET | http | **public** | **off** | [Webhooks](../webhooks.md) |
| `/whatsapp/webhook` | POST | http | **public** | **off** | [Webhooks](../webhooks.md) |

`construction_bim` defines **no** HTTP routes. Its BIM viewer, IFC indexing, BCF
exchange and clash detection are reached entirely through the ORM — see
[Models → BIM](../models/bim.md).

## What "default CSRF" means

For `type="http"` routes, Odoo enables CSRF protection on POST unless
`csrf=False` is passed. Where the table says "default" on a POST route, that
route **requires a valid `csrf_token` form field**, obtained by first fetching
the page that renders the form. These are browser flows, not integration
endpoints.

`type="json"` routes do not use form CSRF tokens; they are protected by the
session and by the JSON content type.

## Which of these are integration endpoints

Honestly: two.

| Endpoint | Use it for |
| --- | --- |
| `POST /majal/field/api/bootstrap` | Pull the current user's assigned work in one call |
| `POST /majal/field/api/sync` | Push a batch of offline operations back, idempotently |

`GET /majal/health` and `GET /majal/health/deep` are monitoring contracts, not
business-data APIs. See [Health](health.md).

Everything else is either a browser page (`website=True`, renders a QWeb
template), a file download, or Meta's callback. For all other integration work,
use [XML-RPC](../xmlrpc.md) or [JSON-RPC](../jsonrpc.md) against the ORM.

## Authentication for `auth="user"` routes

These routes read the **session cookie**. An API key authenticates RPC calls; it
does not create a session. To reach them programmatically you must log in first:

```python
import requests

URL = "https://your-host"
session = requests.Session()

response = session.post(
    f"{URL}/web/session/authenticate",
    json={"jsonrpc": "2.0", "method": "call", "params": {
        "db": "YOUR_DATABASE",
        "login": "YOUR_LOGIN",
        "password": "YOUR_API_KEY",
    }},
    timeout=30,
)
if "error" in response.json():
    raise SystemExit(response.json()["error"])

# session now carries the cookie; subsequent calls are authenticated
csv_file = session.get(f"{URL}/majal/sheets/17/export.csv", timeout=60)
```

Reuse the `Session` object. Each `/web/session/authenticate` creates a new server
session.

## Pages

- [Asset tags](asset-tags.md) — QR and NFC scan landing and confirmation
- [Field app](field-app.md) — offline bootstrap and sync
- [Portal](portal.md) — customer and subcontractor self-service
- [Exports](exports.md) — sheet CSV and recovery archive download
- [Health](health.md) — minimal liveness and privileged readiness probes
- [Public pages](public-pages.md) — branding pages and the database-manager redirects
- [Webhooks](../webhooks.md) — the WhatsApp inbound callback
