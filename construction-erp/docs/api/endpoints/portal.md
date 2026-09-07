# Portal

[← Endpoints](index.md) · [← Index](../index.md)

Source: `custom-addons/construction_portal/controllers/portal.py`,
`custom-addons/facility_portal/controllers/portal.py`,
`custom-addons/majal_real_estate/controllers/portal.py`

Fourteen routes across three controllers, all extending Odoo's stock
`CustomerPortal`. Every one renders a QWeb template and returns HTML. **None of
them is a JSON API**, and none is intended for machine consumption.

They are documented here because you will see them in the route table, because
they define what a portal user can reach, and because one of them performs a
write.

## Construction portal — `construction_portal`

Class `ConstructionPortal(CustomerPortal)`.

| Route | Methods | Template | Notes |
| --- | --- | --- | --- |
| `/my/rfis`, `/my/rfis/page/<int:page>` | any | `construction_portal.portal_my_rfis` | Paged list |
| `/my/rfi/<int:rfi_id>` | any | `construction_portal.portal_rfi_page` | |
| `/my/defects`, `/my/defects/page/<int:page>` | any | `construction_portal.portal_my_defects` | Paged list |
| `/my/defect/<int:defect_id>` | any | `construction_portal.portal_defect_page` | |
| `/my/defect/<int:defect_id>/ready` | **POST** | — | The one write action |
| `/my/subcontracts`, `/my/subcontracts/page/<int:page>` | any | `construction_portal.portal_my_subcontracts` | Paged list |
| `/my/subcontract/<int:sub_id>` | any | `construction_portal.portal_subcontract_page` | |

All are `type="http"`, `auth="user"`, `website=True`.

### Home counters

`_prepare_home_portal_values` adds `rfi_count`, `defect_count` and
`subcontract_count` to `/my` when requested. Each is a `search_count([])` — an
empty domain, narrowed to the user's own records by the portal record rules.

### List routes

Each list route calls `search_count([])` and `search([], limit, offset,
order="id desc")` with an empty domain. There is no filtering, sorting or search
parameter beyond `page`. Page size is `CustomerPortal._items_per_page` (stock
Odoo).

The empty domain is safe because the record rules do the narrowing — see
[Security → Portal users](../security.md#portal-users). The recordset is then
handed to the template with `.sudo()` so related display names render.

### Detail routes

Each detail route calls `self._document_check_access(model, id, access_token)`
and, on `AccessError` or `MissingError`, **redirects to `/my`** rather than
returning 403 or 404. So a portal user probing ids sees a redirect, not an
enumeration oracle.

`access_token` is accepted as a query parameter. All three models mix in
`portal.mixin`, so a shared token link works for an otherwise unentitled visitor
in the usual Odoo way.

### `POST /my/defect/<int:defect_id>/ready`

The only write exposed on the construction portal. It lets the responsible
subcontractor mark a defect ready for inspection.

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `defect_id` | path | yes | |
| `access_token` | query/form | no | Portal share token |

Behaviour:

1. `_document_check_access("construction.defect", defect_id, access_token)` —
   on failure, 303 to `/my`.
2. If `state` is `open`, `in_progress` or `reopened`, calls `action_ready()`.
   Any other state is a silent no-op.
3. 303 redirect to `/my/defect/<id>`.

CSRF protection is at its default — **on** — so a POST needs the `csrf_token`
rendered into the defect page's form. It is a browser flow.

To do the same thing from an integration, call the method over RPC as a user with
write access:

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.defect", "action_ready", [[defect_id]],
)
```

## Facility portal — `facility_portal`

Class `FacilityPortal(CustomerPortal)`. Occupant self-service for maintenance
requests.

| Route | Methods | Template | Notes |
| --- | --- | --- | --- |
| `/my/facility/requests`, `/my/facility/requests/page/<int:page>` | any | `facility_portal.portal_my_requests` | Paged list |
| `/my/facility/request/<int:request_id>` | any | `facility_portal.portal_request_page` | |
| `/my/facility/request/new` | any | `facility_portal.portal_new_request` | Renders the form |
| `/my/facility/request/submit` | **POST** | — | Creates the request |

All are `type="http"`, `auth="user"`, `website=True`. The counter key is
`facility_request_count`.

### The list route escalates deliberately narrowly

`/my/facility/requests` does **not** hand the recordset to the template with
`sudo()`. It builds an explicit list of five values per row — `id`, `name`,
`equipment`, `stage`, `deadline` — and escalates only those, because stage and
equipment names live on models portal users cannot read. Worth copying if you
extend the portal: a blanket `sudo()` on a recordset is one template edit away
from exposing a field it should not.

### `GET /my/facility/request/new`

Renders the reporting form. The asset picker is populated from
`maintenance.equipment` where `portal_selectable = True` **and** `company_id` is
in the user's `company_ids`, limited to 80, ordered by name.

| Field | Type | Description |
| --- | --- | --- |
| `maintenance.equipment.portal_selectable` | boolean | Occupants can pick this asset when reporting a fault. Leave off for anything they should not be able to enumerate. |

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `error` | query | no | Message rendered above the form |

### `POST /my/facility/request/submit`

| Parameter | In | Required | Description |
| --- | --- | --- | --- |
| `name` | form | **yes** | The problem description. Empty redirects back to `/my/facility/request/new?error=…`. |
| `description` | form | no | |
| `equipment_id` | form | no | Must be all digits, else ignored |

Creates a `maintenance.request` with:

- `portal_reporter_id` = the user's partner
- `company_id` = the user's `company_id`
- `maintenance_type` = `"corrective"` — hard-coded, because work raised through
  the portal by an occupant is corrective by definition

`equipment_id` is **re-validated server-side** against
`portal_selectable = True` and the user's companies, regardless of what the form
offered. A value that does not pass is dropped silently and the request is
created without an asset.

Then 303 to `/my/facility/request/<new id>`.

### `maintenance.request.portal_reporter_id`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `portal_reporter_id` | many2one `res.partner` | no | no | The occupant who raised the request from the portal. Indexed. Scoping is on this rather than the internal user, because a portal user has no employee record. |

This is the field the portal record rule filters on:

```
[('portal_reporter_id', 'child_of', user.partner_id.commercial_partner_id.id)]
```

An integration creating requests on an occupant's behalf should set it, or that
occupant will not see the request in their portal.

## What a portal user can reach in total

| Model | read | write | create | unlink |
| --- | --- | --- | --- | --- |
| `construction.rfi` | own (ball in court) | no | no | no |
| `construction.defect` | own (responsible subcontractor) | no — except `action_ready()` | no | no |
| `construction.subcontract` | own | no | no | no |
| `construction.subcontract.payment` | own | no | no | no |
| `maintenance.request` | own (portal reporter) | no | **yes** | no |
| `majal.reservation` | own non-draft reservations or a valid share token | no | no | no |

## Property buyer portal — `majal_real_estate`

| Route | Methods | Authentication | Notes |
| --- | --- | --- | --- |
| `/my/reservations`, `/my/reservations/page/<int:page>` | any | user | Buyer list; draft reservations are excluded |
| `/my/reservation/<int:reservation_id>` | any | public | Detail requires the user's record-rule access or a valid portal `access_token` |

The list domain uses the signed-in partner's commercial entity and excludes
drafts. The search runs as the portal user so record rules decide what is theirs;
rendering then uses the validated record to display related unit and development
names. The public detail route calls `_document_check_access` and redirects to
`/my` when the record or token is invalid, preventing identifier enumeration.

These are HTML pages. Integrations should use the authenticated ORM models in
[Property models](../models/property.md), not scrape the buyer portal.

Full domains in [Security → Portal users](../security.md#portal-users).

## Integrating against portal data

Do not scrape these pages. Query the models over RPC as an **internal** user and
filter by the same partner fields:

```python
"""Everything currently in a subcontractor's court."""
partner_id = 1234

open_rfis = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "search_read",
    [[["ball_in_court_id", "child_of", partner_id],
      ["state", "in", ["submitted"]]]],
    {"fields": ["reference", "name", "project_id", "date_required", "is_overdue"],
     "order": "date_required asc, id desc"},
)

open_defects = models.execute_kw(
    DB, uid, API_KEY, "construction.defect", "search_read",
    [[["responsible_subcontractor_id", "child_of", partner_id],
      ["state", "in", ["open", "in_progress", "reopened"]]]],
    {"fields": ["reference", "name", "severity", "location", "date_required"],
     "order": "severity desc, id desc"},
)
```
