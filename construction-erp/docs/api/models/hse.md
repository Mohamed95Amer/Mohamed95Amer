# HSE

[← Models](index.md) · [← Index](../index.md)

Source: `custom-addons/construction_hse/models/`

Three record models plus a set of computed statistics on the project. Permits are
`construction.approvable`; incidents and toolbox talks are not.

## `construction.permit` — Permit to Work

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`,
**`construction.approvable`**. Order `id desc`.

Fields beyond the [document mixin](projects.md#constructiondocumentmixin):

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `permit_type` | selection | **yes** | no | `hot_work` / `confined_space` / `height` / `excavation` / `electrical` / `lifting` / `other`. Default `hot_work`, tracked. **This is `_approval_kind()`.** |
| `location` | char | no | no | Where on site the work is authorised |
| `description` | text | no | no | Scope of work |
| `contractor_id` | many2one `res.partner` | no | no | Party carrying out the work. Tracked. |
| `supervisor_id` | many2one `res.users` | no | no | Site supervisor. Defaults to the acting user. |
| `task_id` | many2one `project.task` | no | no | Programme activity this permit authorises. Domain `project_id = project_id`. Ties the authority to the work, so a programme can be read for what is *permitted* to start, not only what is scheduled to. |
| `valid_from` | datetime | **yes** | no | Defaults to now (UTC). Tracked. |
| `valid_to` | datetime | **yes** | no | Tracked |
| `workers_count` | integer | no | no | Workers covered. Default 1. |
| `state` | selection | no | no | `draft` / `submitted` / `approved` / `active` / `closed` / `expired` / `suspended` / `rejected`. Default `draft`, tracked. **Guarded** — use the actions. |
| `precaution_ids` | one2many `construction.permit.precaution` | no | no | `copy=True` |
| `precautions_complete` | boolean | — | **computed** | |
| `precaution_progress` | float | — | **computed** | |
| `approved_by_id` | many2one `res.users` | no | **yes** | Tracked |
| `approved_date` | datetime | no | **yes** | |
| `closed_by_id` | many2one `res.users` | no | **yes** | |
| `closed_date` | datetime | no | **yes** | |
| `close_note` | text | no | no | Close-out note |
| `suspend_reason` | text | no | no | |
| `is_live` | boolean | — | **computed, searchable** | Approved or active **and** inside its validity window |

Public methods: `action_submit()`, `action_approve()`, `action_reject()`,
`action_start_work()`, `action_suspend()`, `action_resume()`, `action_close()`,
`action_reset()`.

### Approval behaviour

`_approval_amount()` returns **`0.0`** — a permit is worth nothing and matters
enormously. Rules for permits therefore match on **kind**: hot work and confined
space go to the safety manager, everything else to the project manager. A rule
for permits must have `amount_from = 0`, or it will never match.

`action_approve()` calls `_check_approved()`. On the final signature,
`_on_approval_granted` issues the permit — without that the approval would
complete and the permit would stay `submitted`, which reads as the system having
lost it.

### Validity and precautions

`_check_window` constrains `valid_from` / `valid_to` and raises
`ValidationError`. `_cron_expire_permits` moves permits past `valid_to` to
`expired`.

`is_live` defines `_search_is_live`, so it is filterable:

```python
live = models.execute_kw(
    DB, uid, API_KEY, "construction.permit", "search_read",
    [[["is_live", "=", True], ["project_id", "=", project_id]]],
    {"fields": ["reference", "permit_type", "location", "contractor_id",
                "valid_to", "workers_count"],
     "order": "valid_to"},
)
```

### `construction.permit.precaution`

Order `sequence, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `permit_id` | many2one `construction.permit` | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `name` | char | yes | no | The precaution |
| `mandatory` | boolean | no | no | Default `True`. **Mandatory precautions block approval until confirmed.** |
| `checked` | boolean | no | no | Confirmed |
| `note` | char | no | no | |

```python
permit_id = models.execute_kw(
    DB, uid, API_KEY, "construction.permit", "create",
    [{
        "name": "Welding, roof plant room",
        "project_id": project_id,
        "permit_type": "hot_work",
        "location": "Roof plant room, grid F4-G5",
        "valid_from": "2026-08-03 05:00:00",
        "valid_to": "2026-08-03 13:00:00",
        "workers_count": 4,
        "contractor_id": subcontractor_partner_id,
        "precaution_ids": [
            (0, 0, {"name": "Fire watch posted", "mandatory": True}),
            (0, 0, {"name": "Extinguisher within 5 m", "mandatory": True}),
            (0, 0, {"name": "Combustibles removed 10 m", "mandatory": True}),
        ],
    }],
)
```

Datetimes are naive **UTC**. `05:00:00` above is 05:00 UTC, not local site time.

## `construction.incident` — Incident / near miss

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Order `occurred_on desc, id desc`. Not approvable.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `occurred_on` | datetime | **yes** | no | Defaults to now (UTC). Tracked. |
| `reported_by_id` | many2one `res.users` | no | no | Defaults to the acting user. Tracked. |
| `location` | char | no | no | |
| `contractor_id` | many2one `res.partner` | no | no | Contractor involved |
| `permit_id` | many2one `construction.permit` | no | no | Permit the work was under, if any. **A permitted activity that still produced an incident is a control failure worth finding.** |
| `incident_class` | selection | **yes** | no | `near_miss` / `first_aid` / `medical` / `lost_time` / `permanent_disability` / `fatality` / `property` / `environmental`. Default `near_miss`, tracked. |
| `severity` | selection | **yes** | no | `low` / `medium` / `high` / `critical`. Default `low`, tracked. |
| `is_lti` | boolean | — | **computed, stored** | Counts towards LTIFR and the days-since-last-LTI clock |
| `days_lost` | integer | no | no | Working days lost, for lost-time cases |
| `reportable` | boolean | no | no | Notifiable to the regulator under local law. Tracked. |
| `description` | text | **yes** | no | What happened |
| `immediate_action` | text | no | no | Immediate action taken |
| `root_cause` | text | no | no | |
| `investigator_id` | many2one `res.users` | no | no | |
| `action_ids` | one2many `construction.incident.action` | no | no | `copy=False` |
| `action_progress` | float | — | **computed** | |
| `photo` | image | no | no | Max 1920×1920 |
| `state` | selection | no | no | `reported` / `investigating` / `actions` / `closed`. Default `reported`, tracked. |

Public methods: `action_investigate()`, `action_record_actions()`,
`action_close()`, `action_reopen()`.

`is_lti` is computed from `incident_class` and stored, so it is searchable and
groupable — use it rather than reconstructing the class list yourself.

### `construction.incident.action`

Order `deadline, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `incident_id` | many2one | yes | no | `ondelete="cascade"` |
| `name` | char | yes | no | The action |
| `responsible_id` | many2one `res.users` | no | no | Owner |
| `deadline` | date | no | no | |
| `done` | boolean | no | no | |
| `done_date` | date | no | **yes** | Stamped by `write()` when `done` is set |

## `construction.toolbox.talk`

Inherits `mail.thread`. Not a document-mixin model. Order `talk_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `project_id` | many2one `project.project` | **yes** | no | Indexed, `ondelete="cascade"`, domain `is_construction = True` |
| `company_id` | many2one | — | **related, stored** | |
| `topic` | char | **yes** | no | |
| `talk_date` | date | **yes** | no | Defaults to today (user's timezone) |
| `presenter_id` | many2one `res.users` | no | no | Defaults to the acting user |
| `contractor_id` | many2one `res.partner` | no | no | |
| `location` | char | no | no | |
| `duration_minutes` | integer | no | no | Default 15 |
| `key_points` | text | no | no | |
| `attendee_ids` | one2many `construction.toolbox.attendee` | no | no | `copy=False` |
| `attendee_count` | integer | — | **computed, stored** | |

### `construction.toolbox.attendee`

Order `name`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `talk_id` | many2one | yes | no | `ondelete="cascade"` |
| `name` | char | yes | no | Worker |
| `trade` | char | no | no | |
| `contractor_id` | many2one `res.partner` | no | no | Employer |
| `signature` | binary | no | no | Signed on site as the record of attendance |

## Project safety statistics

Nine computed, non-stored fields on `project.project`, plus four one2many
collections. Full table in
the "Safety statistics" section of [Projects](projects.md).

The two that most often surprise people:

- **`hse_days_since_lti` is `-1`**, not `0`, when the project has never recorded
  a lost-time injury. A dashboard that treats `-1` as "zero days since" reports
  the opposite of the truth.
- **`hse_manhours` comes from the daily site logs**, specifically
  `construction.daily.log.total_labour_hours`. LTIFR is calculated against it, so
  a project whose logs are not being filled in reports an inflated LTIFR.

None of the nine is stored, so none can be filtered, sorted or grouped on in a
domain. Read them per project:

```python
stats = models.execute_kw(
    DB, uid, API_KEY, "project.project", "read",
    [[project_id]],
    {"fields": ["name", "hse_manhours", "hse_incident_count",
                "hse_near_miss_count", "hse_lti_count", "hse_days_lost",
                "hse_ltifr", "hse_days_since_lti",
                "hse_live_permit_count", "hse_open_action_count"]},
)[0]
if stats["hse_days_since_lti"] < 0:
    print("No lost-time injury recorded on this project")
else:
    print(f"{stats['hse_days_since_lti']} days since the last LTI")
```

To aggregate across projects, query the underlying records instead:

```python
lti_by_project = models.execute_kw(
    DB, uid, API_KEY, "construction.incident", "read_group",
    [[["is_lti", "=", True]], ["days_lost:sum"], ["project_id"]],
    {"lazy": False},
)
```
