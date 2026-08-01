# Projects

[← Models](index.md) · [← Index](../index.md)

Source: `custom-addons/construction_base/models/`,
`custom-addons/construction_planning/models/`,
`custom-addons/construction_ui/models/project_workspace.py`

Majal does not add a project model. It extends Odoo's `project.project` and
`project.task`. **Every construction record hangs off a project**, and the record
rules that decide what a user can see are expressed in terms of project
membership — so this is the first model to get right.

## `project.project`

Flagged as a construction project by `is_construction`. The extensions arrive
from five addons.

### Core construction fields — `construction_base`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `is_construction` | boolean | no | no | **Set this.** Almost every Majal domain filters on it, and `construction.document.mixin.project_id` has domain `[('is_construction','=',True)]`. |
| `project_code` | char | no | yes | Short unique code, used as the prefix for every document reference (RFI-, SUB-, …). Assigned on create; `copy=False`. |
| `construction_stage` | selection | no | no | `tender` / `mobilization` / `execution` / `handover` / `dlp` / `closed`. Default `tender`, tracked. |
| `project_type` | selection | no | no | `building` / `infrastructure` / `fitout` / `mep` / `facility` / `other`. Default `building`. |
| `client_id` | many2one `res.partner` | no | no | Client / employer |
| `consultant_id` | many2one `res.partner` | no | no | Consultant / engineer |
| `main_contractor_id` | many2one `res.partner` | no | no | |
| `site_address` | text | no | no | |
| `contract_value` | monetary | no | no | Tracked |
| `currency_id` | many2one `res.currency` | no | no | Defaults to the company currency |
| `retention_percent` | float | no | no | Percentage withheld from each progress payment. Default 10.0. |
| `retention_cap_percent` | float | no | no | Maximum cumulative retention as a percentage of contract value. Default 5.0. |
| `date_commencement` | date | no | no | |
| `date_completion_planned` | date | no | no | |
| `date_taking_over` | date | no | no | |
| `date_dlp_end` | date | no | no | Defects liability period end |

`project_code` is generated in `create()`. Do not send it; it is what every
document reference is built from.

### Tenant scoping — `majal_administration`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `majal_manager_id` | many2one `res.users` | no | no | Majal project manager. Domain `share = False`. |
| `majal_member_ids` | many2many `res.users` | no | no | Majal project team. Domain `share = False`. |

**These two decide visibility.** A user whose `majal_role_id.rank` is below 40
sees only projects where they are the manager or a member, and by extension only
the documents belonging to those projects. See
[Security → Record rules](../security.md#record-rules).

A construction project must have a company: `@api.constrains` raises
`ValidationError: Every construction project must belong to a company.` The
`create` override fills `company_id` from `env.company` when `is_construction` is
set and no company is given.

### Programme / CPM — `construction_planning`

All readonly, written by `action_reschedule()`.

| Field | Type | Readonly | Description |
| --- | --- | --- | --- |
| `scheduled_start` | date | yes | Earliest scheduled activity start (CPM) |
| `scheduled_finish` | date | yes | Latest scheduled activity finish (CPM) |
| `schedule_duration_days` | integer | yes | Working days between the two |
| `critical_task_count` | integer | yes | |
| `last_rescheduled` | datetime | yes | |
| `baseline_date` | datetime | yes | When the current baseline was captured |

Public methods: `action_reschedule()`, `action_set_baseline()`.

### Safety statistics — `construction_hse`

All **computed** and not stored: read them, never write, and do not try to search
or group on them.

| Field | Type | Description |
| --- | --- | --- |
| `hse_manhours` | float | Total labour hours from the project's daily site logs |
| `hse_incident_count` | integer | |
| `hse_near_miss_count` | integer | |
| `hse_lti_count` | integer | Lost time injuries |
| `hse_days_lost` | integer | |
| `hse_ltifr` | float | Lost Time Injury Frequency Rate — LTIs per one million hours worked |
| `hse_days_since_lti` | integer | **`-1` when the project has never recorded an LTI.** Not zero. |
| `hse_live_permit_count` | integer | |
| `hse_open_action_count` | integer | |

Plus one2many collections `hse_incident_ids`, `hse_permit_ids`, `hse_talk_ids`,
`hse_daily_log_ids`.

### Commercial value report (CVR) — `construction_report`

All **computed**, not stored. Four of them define `search=` handlers and can
therefore be filtered on: `cvr_contract_value`, `cvr_uncommitted_budget`,
`cvr_margin_variance`. The rest cannot.

| Field | Type | Searchable | Description |
| --- | --- | --- | --- |
| `cvr_boq_id` | many2one `construction.boq` | no | Latest non-draft BOQ used as the baseline |
| `cvr_contract_value` | monetary | **yes** | BOQ sell total, including approved variations |
| `cvr_certified_value` | monetary | no | Cumulative work done certified on the latest IPC |
| `cvr_percent_complete` | float | no | Certified as a share of contract value |
| `cvr_budget_cost` | monetary | no | Estimated cost of the whole works |
| `cvr_committed_cost` | monetary | no | Value of confirmed subcontracts — cost tied up whether or not the work is done |
| `cvr_cost_to_date` | monetary | no | Gross value certified to subcontractors |
| `cvr_uncommitted_budget` | monetary | **yes** | Budget not yet tied to a subcontract. Negative means commitments exceed budget. |
| `cvr_earned_margin` | monetary | no | Certified less cost to date |
| `cvr_earned_margin_percent` | float | no | |
| `cvr_forecast_margin` | monetary | no | Contract value less expected final cost (committed + budget for work not yet let) |
| `cvr_forecast_margin_percent` | float | no | |
| `cvr_margin_variance` | monetary | **yes** | Forecast against the priced margin. Negative means the job is eroding. |

### Materials — `construction_material`

| Field | Type | Readonly | Description |
| --- | --- | --- | --- |
| `site_location_id` | many2one `stock.location` | no | Site store holding delivered materials. Created on demand by `ensure_site_location()`. `copy=False`. |
| `material_budget_value` | monetary | **computed** | Budgeted material cost from BOQ lines naming a product |
| `material_consumed_value` | monetary | **computed** | |
| `material_waste_value` | monetary | **computed** | |
| `material_waste_percent` | float | **computed** | Wasted as a share of everything issued from the store |
| `material_on_hand_value` | monetary | **computed** | |
| `material_over_budget_count` | integer | **computed** | |

### Workspace counters — `construction_ui`

`majal_document_count`, `drawing_count`, `boq_count`, `site_form_count`,
`quality_item_count`, `engineering_item_count` — all computed, not stored, for the
workspace UI. Plus one2many shortcuts: `majal_document_ids`, `drawing_ids`,
`boq_ids`, `form_inspection_ids`, `defect_ids`, `rfi_ids`, `submittal_ids`.

### Creating a project

```python
project_id = models.execute_kw(
    DB, uid, API_KEY, "project.project", "create",
    [{
        "name": "Riverside Tower — Main Works",
        "is_construction": True,
        "project_type": "building",
        "construction_stage": "execution",
        "contract_value": 48_500_000.0,
        "retention_percent": 10.0,
        "retention_cap_percent": 5.0,
        "date_commencement": "2026-03-01",
        "date_completion_planned": "2028-02-28",
        "majal_manager_id": manager_uid,
        "majal_member_ids": [(6, 0, [engineer_uid, qs_uid])],
    }],
)
```

`project_code` comes back populated. Read it:

```python
code = models.execute_kw(
    DB, uid, API_KEY, "project.project", "read",
    [[project_id]], {"fields": ["project_code", "company_id", "currency_id"]},
)[0]
```

## `construction.document.mixin`

Source: `construction_base/models/construction_document_mixin.py`

Every construction document inherits this. These seven fields exist on all of
them and are **not** repeated in the per-model tables.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | The document title |
| `reference` | char | no | **yes** | Server-assigned on create as `<project_code>-<PREFIX>-<0001>`, e.g. `RVT-RFI-0007`. Falls back to `P<project id>` when the project has no code. `copy=False`. Do not send it. |
| `project_id` | many2one `project.project` | **yes** | no | Indexed, `ondelete="restrict"`, domain `is_construction = True` |
| `company_id` | many2one `res.company` | — | **related, stored** | `project_id.company_id`. Write the project, not this. |
| `ball_in_court_id` | many2one `res.partner` | no | no | Party currently responsible for the next action. Tracked. |
| `date_required` | date | no | no | Date by which a response or action is required |
| `is_overdue` | boolean | — | **computed, searchable** | `date_required < today` and the document is still open |

`is_overdue` is not stored but defines `_search_is_overdue`, so this works:

```python
overdue = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "search_read",
    [[["is_overdue", "=", True]]],
    {"fields": ["reference", "name", "date_required", "ball_in_court_id"]},
)
```

Each model decides what "still open" means through a private
`_is_open_for_overdue()` hook, so a closed RFI is never overdue.

Models inheriting the mixin: `construction.rfi`, `construction.submittal`,
`construction.defect`, `construction.change.event`, `construction.change.order`,
`construction.progress.claim`, `construction.subcontract`,
`construction.subcontract.payment`, `construction.incident`,
`construction.permit`, `construction.tender`, `construction.material.issue`,
`construction.meeting`, `construction.bim.model`, `majal.project.document`.

`construction.boq`, `construction.daily.log`, `construction.toolbox.talk` and
`construction.form.inspection` do **not** inherit it — they define their own
`project_id` and `company_id` and have no `reference` or `ball_in_court_id`.

## `project.task` — programme activities

Source: `construction_planning/models/project_task.py`, `task_boq_link.py`,
`construction_pin/models/project_task.py`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `wbs_code` | char | no | no | Work breakdown structure code |
| `is_milestone` | boolean | no | no | |
| `planned_duration` | integer | no | no | Working days the activity occupies. Default 1. Ignored for milestones. |
| `constraint_date` | date | no | no | Start no earlier than |
| `planned_start` | datetime | no | no | Scheduled start |
| `planned_finish` | datetime | no | no | Scheduled finish |
| `progress` | float | no | no | % complete |
| `cpm_early_start` | date | no | **yes** | Written by `action_reschedule()` |
| `cpm_early_finish` | date | no | **yes** | |
| `cpm_late_start` | date | no | **yes** | |
| `cpm_late_finish` | date | no | **yes** | |
| `total_float` | integer | no | **yes** | Working days the activity can slip without delaying the project |
| `is_critical` | boolean | no | **yes** | Indexed |
| `baseline_start` | datetime | no | **yes** | |
| `baseline_finish` | datetime | no | **yes** | |
| `finish_variance_days` | integer | — | **computed, stored** | Working days the scheduled finish has slipped (+) or gained (−) against baseline |
| `predecessor_link_ids` | one2many `construction.task.link` | no | no | Inverse `successor_id` |
| `successor_link_ids` | one2many `construction.task.link` | no | no | Inverse `predecessor_id` |
| `predecessor_task_ids` | many2many `project.task` | — | **computed** | For drawing dependency arrows |
| `boq_line_ids` | many2many `construction.boq.line` | no | no | Bill items this activity delivers. Domain `project_id = project_id`. |
| `boq_value` | monetary | — | **computed** | Sell value of the linked bill items |
| `boq_certified_percent` | float | — | **computed** | Value-weighted share of linked items certified |
| `boq_progress_gap` | float | — | **computed** | Reported progress less certified. Positive means the programme claims more than has been certified. |
| `pin_ids` | one2many `construction.pin` | no | no | |
| `pin_count` | integer | — | **computed** | |

The CPM fields are outputs. Write `planned_duration`, `constraint_date` and the
dependency links, then call `action_reschedule()` on the project.

## `construction.task.link` — dependencies

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `predecessor_id` | many2one `project.task` | yes | no | Indexed, `ondelete="cascade"` |
| `successor_id` | many2one `project.task` | yes | no | Indexed, `ondelete="cascade"` |
| `link_type` | selection | yes | no | `FS` Finish→Start (default), `SS`, `FF`, `SF` |
| `lag_days` | integer | no | no | Working days. Positive delays the successor; negative allows overlap (lead). |
| `project_id` | many2one `project.project` | — | **related, stored** | `successor_id.project_id`, indexed |
| `display_name` | char | — | **computed** | |

`_check_link` fires on create and write and raises `ValidationError` for:

| Message | Cause |
| --- | --- |
| `A task cannot depend on itself.` | `predecessor_id == successor_id` |
| `Both tasks of a dependency must be in the same project.` | different projects |

It then calls `_check_no_cycle`, which walks the project's links and rejects a
dependency that would close a loop.

```python
link_id = models.execute_kw(
    DB, uid, API_KEY, "construction.task.link", "create",
    [{"predecessor_id": excavation_task_id,
      "successor_id": blinding_task_id,
      "link_type": "FS",
      "lag_days": 2}],
)
models.execute_kw(
    DB, uid, API_KEY, "project.project", "action_reschedule", [[project_id]],
)
```

## `majal.project.document`

Source: `construction_ui/models/project_workspace.py`

A general commercial/administrative document register on a project. Inherits
`construction.document.mixin`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `document_type` | selection | yes | no | `tender` / `bid_request` / `quotation` / `sales_order` / `contract` / `permit` / `general`. Default `general`, tracked. |
| `partner_id` | many2one `res.partner` | no | no | Related party. Tracked. |
| `date_document` | date | yes | no | Defaults to today (user's timezone) |
| `amount` | monetary | no | no | Tracked |
| `currency_id` | many2one `res.currency` | — | **related, stored** | `project_id.currency_id` |
| `state` | selection | yes | no | `draft` / `submitted` / `under_review` / `approved` / `rejected` / `closed`. Default `draft`, tracked. |
| `attachment_ids` | many2many `ir.attachment` | no | no | Files and attachments |
| `description` | html | no | no | |
| `submitted_by_id` | many2one `res.users` | no | yes | |
| `submitted_date` | datetime | no | yes | |
| `approver_id` | many2one `res.users` | no | no | Tracked |
| `approved_by_id` | many2one `res.users` | no | yes | |
| `approved_date` | datetime | no | yes | |
| `decision_note` | text | no | no | |

Public methods: `action_submit()`, `action_review()`, `action_approve()`,
`action_reject()`, `action_close()`, `action_reset_draft()`. A private
`_check_named_approver` guard restricts who may approve.

This model is **not** `construction.approvable` — it has its own single-approver
workflow, independent of the approval engine.

## `construction.drawing.revision` sign-off — `construction_ui`

`construction_ui` extends `construction.drawing.revision` with a parallel
sign-off workflow. The revision fields themselves are in
[Site → Drawings](site.md#constructiondrawing).

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `approval_state` | selection | yes | no | `draft` / `submitted` / `approved` / `rejected`. Default `draft`, tracked. |
| `approver_id` | many2one `res.users` | no | no | Sign-off by. Tracked. |
| `submitted_by_id` | many2one `res.users` | no | yes | |
| `submitted_date` | datetime | no | yes | |
| `approved_by_id` | many2one `res.users` | no | yes | |
| `approved_date` | datetime | no | yes | |
| `approval_note` | text | no | no | Review / sign-off note |

`state` gains a new default of `superseded` under this addon — a new revision is
not automatically current. Use `action_make_current()`.

Public methods: `action_submit_approval()`, `action_approve_revision()`,
`action_reject_revision()`, `action_reset_approval()`, `action_make_current()`,
`action_open_revision()`. Guarded by a private `_check_signoff_authority`.
