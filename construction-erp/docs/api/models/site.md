# Site

[← Models](index.md) · [← Index](../index.md)

Source: `construction_rfi`, `construction_submittal`, `construction_drawing`,
`construction_defect`, `construction_daily_log`, `construction_form`,
`construction_meeting`, `construction_pin`, `construction_material`

Everything that happens between mobilisation and handover. Unless noted, each
model inherits [`construction.document.mixin`](projects.md#constructiondocumentmixin)
and its seven shared fields are not repeated here.

## `construction.rfi` — Request for Information

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`, and
`portal.mixin` (from `construction_portal`). Order `id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `question` | html | **yes** | no | |
| `answer` | html | no | **yes** | Written by `action_answer()` |
| `state` | selection | no | no | `draft` / `submitted` / `answered` / `closed`. Default `draft`, indexed, tracked. |
| `raised_by_id` | many2one `res.users` | no | yes | Defaults to the acting user |
| `answered_by_id` | many2one `res.users` | no | yes | |
| `date_submitted` | datetime | no | yes | |
| `date_answered` | datetime | no | yes | |
| `drawing_revision_ids` | many2many `construction.drawing.revision` | no | no | Referenced drawings. Domain `project_id = project_id`. |
| `discipline` | selection | no | no | `architectural` / `structural` / `mep` / `civil` / `other`. Default `other`. |
| `cost_impact` | boolean | no | no | The answer may change the contract cost — a candidate for a change event |
| `schedule_impact` | boolean | no | no | The answer may affect the programme — a candidate for an EOT |
| `portal_visible` | boolean | no | no | Default `True`. Show this RFI to portal users. A display flag on top of the record rule, not a second access control. |
| `change_event_ids` | one2many `construction.change.event` | no | no | From `construction_change_order` |
| `change_event_count` | integer | — | **computed** | |
| `pin_ids` | one2many `construction.pin` | no | no | From `construction_pin` |
| `pin_count` | integer | — | **computed** | |

Public methods: `action_submit()`, `action_answer()`, `action_close()`,
`action_reopen()`, `action_raise_change_event()`.

`_notify_ball_in_court` fires on assignment and `_cron_overdue_reminders` chases
overdue RFIs. Both are private.

```python
rfi_id = models.execute_kw(
    DB, uid, API_KEY, "construction.rfi", "create",
    [{
        "name": "Rebar spacing conflict at grid C3",
        "project_id": project_id,
        "question": "<p>S-201 Rev B shows 150 c/c; the spec says 200 c/c.</p>",
        "discipline": "structural",
        "date_required": "2026-08-14",
        "cost_impact": True,
        "ball_in_court_id": consultant_partner_id,
    }],
)
models.execute_kw(DB, uid, API_KEY, "construction.rfi", "action_submit", [[rfi_id]])
```

## `construction.submittal`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin` and
**`tier.validation`** (from the OCA `base_tier_validation` addon). Order `id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `submittal_type` | selection | **yes** | no | `shop_drawing` / `material` / `method` / `prequalification` / `other`. Default `material`. |
| `spec_section` | char | no | no | e.g. `09 30 00 Tiling` |
| `revision` | char | **yes** | **yes** | Default `A`. Bumped by `action_revise_resubmit()`. |
| `previous_revision_id` | many2one `construction.submittal` | no | yes | |
| `next_revision_id` | many2one `construction.submittal` | no | yes | |
| `state` | selection | no | no | `draft` / `submitted` / `approved` / `approved_as_noted` / `revise_resubmit` / `closed`. Default `draft`, indexed, tracked. |
| `review_comment` | html | no | no | Reviewer's comments returned with the decision |
| `attachment_ids` | many2many `ir.attachment` | no | no | Submitted documents |
| `subcontractor_id` | many2one `res.partner` | no | no | Originating subcontractor or supplier |

Public methods: `action_submit()`, `action_approve()`,
`action_approve_as_noted()`, `action_revise_resubmit()`, `action_close()`.

> Submittals use **tier validation**, not Majal's approval engine. They have no
> `approval_state` and no `construction.approval.request`. The review flow is
> `tier.validation`'s — a different set of models (`tier.definition`,
> `tier.review`) and a different vocabulary. Do not look for them in
> [Approvals](../approvals.md).

## `construction.drawing`

Inherits `mail.thread`. **Not** a document-mixin model — no `reference`, no
`ball_in_court_id`. Order `project_id, number`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Title |
| `number` | char | **yes** | no | Drawing number |
| `project_id` | many2one `project.project` | **yes** | no | Indexed, `ondelete="restrict"`, domain `is_construction = True` |
| `discipline` | selection | no | no | `architectural` / `structural` / `mechanical` / `electrical` / `plumbing` / `civil` / `landscape` / `other`. Default `architectural`. |
| `revision_ids` | one2many `construction.drawing.revision` | no | no | `copy=False` |
| `current_revision_id` | many2one | — | **computed, stored** | The revision whose `state` is `current` |
| `revision_count` | integer | — | **computed** | |

Public method: `action_open_plan_viewer()`.

### `construction.drawing.revision`

Order `drawing_id, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `drawing_id` | many2one `construction.drawing` | yes | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | |
| `revision` | char | yes | no | Default `A` |
| `issue_date` | date | no | no | Defaults to today (user's timezone) |
| `issued_for` | selection | **yes** | no | `tender` / `approval` / `construction` / `asbuilt`. Default `construction`. |
| `attachment_id` | many2one `ir.attachment` | no | no | The sheet PDF. `ondelete="restrict"`. |
| `sheet_file` | binary | no | — | **computed with `inverse=`, `attachment=False`** — writable. Writing it stores the PDF as `attachment_id`. |
| `sheet_filename` | char | no | no | |
| `has_sheet` | boolean | — | **computed** | |
| `state` | selection | **yes** | no | `current` / `superseded`. Default `current` — but `construction_ui` changes that default to `superseded`. |
| `display_name` | char | — | **computed, stored** | |

Public methods: `upload_sheet(filename, data_b64)`, `action_make_current()`,
`action_open_plan_viewer()`, plus the sign-off workflow added by
`construction_ui` (see the "`construction.drawing.revision` sign-off" section of [Projects](projects.md)).

`_check_pdf` validates the upload; a non-PDF raises `ValidationError`.

```python
import base64

with open("S-201-RevC.pdf", "rb") as handle:
    payload = base64.b64encode(handle.read()).decode()

revision_id = models.execute_kw(
    DB, uid, API_KEY, "construction.drawing.revision", "create",
    [{"drawing_id": drawing_id, "revision": "C", "issued_for": "construction"}],
)
models.execute_kw(
    DB, uid, API_KEY, "construction.drawing.revision", "upload_sheet",
    [[revision_id], "S-201-RevC.pdf", payload],
)
models.execute_kw(
    DB, uid, API_KEY, "construction.drawing.revision", "action_make_current",
    [[revision_id]],
)
```

`construction.drawing.upload` is a transient bulk-import wizard: `project_id`,
`issued_for`, `split_pages` (default `True` — one sheet per PDF page),
`file_ids` (many2many `ir.attachment`), and `action_import()`.

## `construction.defect` — Punch item

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin` and
`portal.mixin`. Order `id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `description` | text | no | no | |
| `location` | char | no | no | Where on site, e.g. `Level 3 lobby, grid C3` |
| `trade` | selection | no | no | `architectural` / `structural` / `mep` / `civil` / `other`. Default `architectural`. |
| `severity` | selection | **yes** | no | `low` / `medium` / `high` / `critical`. Default `medium`. |
| `phase` | selection | **yes** | no | `punch` (snagging before handover) / `dlp` (warranty defect after taking-over). Default `punch`. |
| `state` | selection | no | no | `open` / `in_progress` / `ready` / `closed` / `reopened`. Default `open`, tracked. |
| `responsible_subcontractor_id` | many2one `res.partner` | no | no | **The portal record rule filters on this.** Tracked. |
| `assigned_user_id` | many2one `res.users` | no | no | Tracked. The offline API's assignment check uses this. |
| `photo_before` | image | no | no | Max 1920×1920 |
| `photo_after` | image | no | no | Max 1920×1920 |
| `date_identified` | date | no | no | Defaults to today (user's timezone) |
| `pin_ids` | one2many `construction.pin` | no | no | |
| `pin_count` | integer | — | **computed** | |
| `color` | integer | — | **computed** | Kanban colour |
| `inspection_id` | many2one `construction.form.inspection` | no | **yes** | Inspection whose failed check produced this defect. Indexed, `ondelete="set null"`. |
| `inspection_answer_id` | many2one `construction.form.answer` | no | **yes** | The specific failed check, so one defect is raised per finding |

Public methods: `action_start()`, `action_ready()`, `action_close()`,
`action_reopen()`, `status_bucket()`.

`action_ready()` is the **only write a portal user can perform anywhere in the
product**, reached through `POST /my/defect/<id>/ready`.

Not approvable, so `state` may be written directly — but `_require_state` guards
the actions, so prefer them.

## `construction.daily.log`

Inherits `mail.thread` and **`construction.approvable`**. Not a document-mixin
model. Order `log_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `project_id` | many2one `project.project` | **yes** | no | Indexed, `ondelete="cascade"`, domain `is_construction = True` |
| `company_id` | many2one | — | **related, stored** | |
| `log_date` | date | **yes** | no | Defaults to today **in the user's timezone** — set `tz` on the integration user |
| `display_name` | char | — | **computed, stored** | |
| `weather` | selection | no | no | `sunny` / `cloudy` / `rain` / `storm` / `hot` / `windy`. Default `sunny`. |
| `temperature` | float | no | no | °C |
| `prepared_by_id` | many2one `res.users` | no | no | Defaults to the acting user |
| `state` | selection | no | no | `draft` / `submitted` / `approved`. Default `draft`, tracked. **Guarded.** |
| `notes` | text | no | no | |
| `manpower_ids` | one2many `construction.daily.log.manpower` | no | no | |
| `equipment_ids` | one2many `construction.daily.log.equipment` | no | no | |
| `activity_ids` | one2many `construction.daily.log.activity` | no | no | |
| `delay_ids` | one2many `construction.daily.log.delay` | no | no | |
| `total_headcount` | integer | — | **computed, stored** | |
| `total_labour_hours` | float | — | **computed, stored** | Feeds `project.project.hse_manhours` and the LTIFR calculation |
| `total_delay_hours` | float | — | **computed, stored** | |

Public methods: `action_submit()`, `action_approve()`, `action_reset()`.
`_approval_amount()` returns `0.0` — a rule for daily logs must start at zero.

### The four line models

`construction.daily.log.manpower`: `log_id` (required, cascade), `trade` (char,
required), `contractor_id` (many2one `res.partner`), `headcount` (integer,
default 1), `hours` (float, hours per person, default 8.0).

`construction.daily.log.equipment`: `log_id`, `name` (char, required, e.g. Tower
crane), `quantity` (integer, default 1), `hours` (float, operating hours,
default 8.0).

`construction.daily.log.activity`: `log_id`, `description` (char, required),
`location` (char), `boq_line_id` (many2one, domain `project_id =
parent.project_id`).

`construction.daily.log.delay`: `log_id`, `cause` (char, required), `category`
(selection `weather` / `material` / `labour` / `design` / `access` / `other`,
default `other`), `hours_lost` (float).

```python
log_id = models.execute_kw(
    DB, uid, API_KEY, "construction.daily.log", "create",
    [{
        "project_id": project_id,
        "log_date": "2026-07-31",
        "weather": "hot",
        "temperature": 44.0,
        "manpower_ids": [
            (0, 0, {"trade": "Steel fixers", "headcount": 18, "hours": 9.0}),
            (0, 0, {"trade": "Carpenters", "headcount": 12, "hours": 9.0}),
        ],
        "delay_ids": [
            (0, 0, {"cause": "Concrete pump breakdown",
                    "category": "material", "hours_lost": 3.5}),
        ],
    }],
    {"context": {"tz": "Asia/Riyadh"}},
)
```

## `construction.form.template` — Inspection checklists

Inherits `mail.thread`. Order `name`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Tracked |
| `code` | char | **yes** | no | `copy=False` |
| `project_id` | many2one `project.project` | no | no | Empty means the template is available to every project |
| `company_id` | many2one `res.company` | **yes** | no | Defaults to `env.company` |
| `description` | html | no | no | |
| `question_ids` | one2many `construction.form.question` | no | no | `copy=True` |
| `active` | boolean | no | no | Default `True` |
| `recurring` | boolean | no | no | |
| `recurrence_interval` | integer | no | no | Default 1 |
| `recurrence_unit` | selection | no | no | `days` / `weeks` / `months`. Default `weeks`. |
| `next_run_date` | date | no | no | |
| `responsible_id` | many2one `res.users` | no | no | Default inspector |
| `inspection_count` | integer | — | **computed** | |
| `question_count` | integer | — | **computed** | |

`_check_recurring_has_a_project` raises `ValidationError` if `recurring` is set
without a `project_id`. `_cron_generate_recurring_inspections` creates the
scheduled inspections.

Public method: `action_new_inspection()`. `construction.form.library` exposes
`action_install_library()`, which loads a set of standard forms.

### `construction.form.question`

Order `sequence, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `template_id` | many2one | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `section` | char | no | no | |
| `name` | char | yes | no | The question |
| `answer_type` | selection | **yes** | no | `yes_no` (Yes/No/N-A) / `text` / `number` / `date` / `photo` / `signature`. Default `yes_no`. |
| `required` | boolean | no | no | |
| `instructions` | char | no | no | |

## `construction.form.inspection`

Inherits `mail.thread`, `mail.activity.mixin`, **`construction.approvable`**. Not
a document-mixin model. Order `scheduled_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | no | **yes** | Assigned in `create()`. `copy=False`. |
| `template_id` | many2one `construction.form.template` | **yes** | no | `ondelete="restrict"` |
| `project_id` | many2one `project.project` | **yes** | no | Domain `is_construction = True` |
| `company_id` | many2one | — | **related, stored** | |
| `scheduled_date` | date | **yes** | no | Defaults to today (user's timezone) |
| `completed_date` | datetime | no | yes | |
| `inspector_id` | many2one `res.users` | **yes** | no | Defaults to the acting user. **The offline API's assignment check uses this.** |
| `location` | char | no | no | |
| `state` | selection | no | no | `draft` / `in_progress` / `submitted` / `approved` / `rejected`. Default `draft`, tracked. **Guarded.** |
| `answer_ids` | one2many `construction.form.answer` | no | no | `copy=False`. Populated from the template. |
| `notes` | text | no | no | |
| `score` | float | — | **computed, stored** | |
| `question_count` | integer | — | **computed** | |
| `answered_count` | integer | — | **computed** | |
| `remaining_count` | integer | — | **computed** | |
| `progress` | float | — | **computed** | Share of the checklist answered, as a percentage |
| `uses_text`, `uses_number`, `uses_date`, `uses_binary` | boolean | — | **computed** | Which answer widgets the form needs |
| `defect_ids` | one2many `construction.defect` | no | no | Defects raised from failed checks |
| `defect_count` | integer | — | **computed** | |
| `failed_check_count` | integer | — | **computed** | Yes/No checks answered `no` |
| `unraised_check_count` | integer | — | **computed** | Failed checks with no defect yet |

Public methods: `action_start()`, `action_submit()`, `action_approve()`,
`action_reject()`, `action_reset()`, `action_pass_remaining()`,
`action_raise_defects()`, `action_view_defects()`.

`action_raise_defects()` creates **one defect per failed check**, linking each
back through `inspection_answer_id` — not one defect per inspection.

`_approval_amount()` returns `0.0`.

### `construction.form.answer`

Order `sequence, question_id`. Write the field matching the question's type.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `inspection_id` | many2one | yes | no | `ondelete="cascade"` |
| `question_id` | many2one | yes | no | `ondelete="restrict"` |
| `answer_type` | selection | — | **related** | `question_id.answer_type` |
| `section` | char | — | **related** | |
| `instructions` | char | — | **related** | |
| `is_required` | boolean | — | **related** | |
| `sequence` | integer | — | **related, stored** | |
| `answer_yes_no` | selection | no | no | `yes` / `no` / `na` |
| `answer_text` | text | no | no | |
| `answer_number` | float | no | no | |
| `answer_date` | date | no | no | |
| `answer_binary` | binary | no | no | `attachment=True`. Photo or signature. |
| `answer_filename` | char | no | no | |
| `comment` | char | no | no | |
| `is_answered` | boolean | — | **computed** | |
| `is_failed` | boolean | — | **computed** | A Yes/No check answered `no`. These are what become defects. |

`_check_template` constrains an answer to a question from its inspection's own
template.

## `construction.meeting`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Order `meeting_date desc, id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `meeting_type` | selection | **yes** | no | `progress` / `site` / `technical` / `hse` / `client` / `other`. Default `progress`, tracked. |
| `series` | char | no | no | Meetings sharing a series carry their open actions forward, e.g. `Weekly Progress` |
| `meeting_date` | datetime | **yes** | no | Defaults to now (UTC) |
| `location` | char | no | no | |
| `chaired_by_id` | many2one `res.users` | no | no | Defaults to the acting user |
| `minutes` | html | no | no | Discussion |
| `state` | selection | no | no | `draft` / `issued` / `closed`. Default `draft`, tracked. |
| `attendee_ids` | one2many `construction.meeting.attendee` | no | no | `copy=False` |
| `action_ids` | one2many `construction.meeting.action` | no | no | `copy=False` |
| `previous_meeting_id` | many2one `construction.meeting` | no | yes | Meeting whose open actions were carried in. `copy=False`. |
| `attendee_count` | integer | — | **computed, stored** | |
| `open_action_count` | integer | — | **computed, stored** | |
| `overdue_action_count` | integer | — | **computed, stored** | |

Public methods: `action_issue()`, `action_close()`, `action_reset()`,
`action_next_meeting()` — the last creates the next meeting in the series and
carries open actions forward.

### `construction.meeting.attendee`

`meeting_id`, `partner_id` (many2one `res.partner`), `name` (char, required),
`organisation` (char), `present` (boolean, default `True`), `apologies`
(boolean).

### `construction.meeting.action`

Order `deadline, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `meeting_id` | many2one | yes | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | Indexed |
| `sequence` | integer | no | no | Default 10 |
| `name` | char | yes | no | The action |
| `description` | text | no | no | |
| `owner_id` | many2one `res.users` | no | no | Internal owner |
| `owner_partner_id` | many2one `res.partner` | no | no | Use when the action sits with a subcontractor or consultant |
| `deadline` | date | no | no | |
| `state` | selection | **yes** | no | `open` / `in_progress` / `closed`. Default `open`. |
| `closed_date` | date | no | yes | Set by `write()` when the state moves to `closed` |
| `origin_meeting_id` | many2one `construction.meeting` | no | **yes** | Where it was first raised, preserved across carry-forward so its true age stays visible |
| `carried_count` | integer | no | **yes** | How many meetings it has been carried through. **A high number is the signal — it is the item nobody is doing.** |
| `is_overdue` | boolean | — | **computed, searchable** | |

## Plan pins

`plan.pin.mixin` (`construction_pin`) is an abstract model providing coordinate
pins on a PDF sheet. Two concrete models use it: `construction.pin` (on drawing
revisions) and `facility.pin` (on floor plans — see
[Facilities](facilities.md#facilitypin)).

### `plan.pin.mixin` — shared fields

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | Default `Pin` |
| `pos_x` | float | **yes** | no | `digits=(12, 9)`. Normalised sheet coordinate. |
| `pos_y` | float | **yes** | no | `digits=(12, 9)` |
| `pin_type` | selection | **yes** | no | Dynamic — `_selection_pin_type` builds it from the registry of linkable models. Default `note`. |
| `note` | text | no | no | |
| `status` | char | — | **computed** | Status of the linked record |
| `color` | integer | — | **computed** | |
| `status_bucket` | char | — | **computed** | |

`_check_coords` constrains the coordinates. Public methods:
`action_open_target()`, `get_plan_data(sheet_id)`,
`create_pin_with_target(sheet_id, pos_x, pos_y, pin_type, name, description)`.

`create_pin_with_target` is the one to use from an integration: it creates the
pin **and** the record it points at in one call.

### `construction.pin`

Order `revision_id, id`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `revision_id` | many2one `construction.drawing.revision` | **yes** | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | Indexed |
| `task_id` | many2one `project.task` | no | no | `ondelete="cascade"` |
| `rfi_id` | many2one `construction.rfi` | no | no | `ondelete="cascade"` |
| `defect_id` | many2one `construction.defect` | no | no | From `construction_defect`. `ondelete="cascade"`. |

A pin points at exactly one of `task_id`, `rfi_id`, `defect_id`, or none (a plain
note). `pin_type` selects which.

## Materials

### `construction.material.issue`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Order `id desc`. Issuing materials out of the site store.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `issue_date` | date | **yes** | no | Defaults to today (user's timezone). Tracked. |
| `issued_to_id` | many2one `res.partner` | no | no | Subcontractor or crew receiving the materials |
| `task_id` | many2one `project.task` | no | no | Programme activity consumed against. Domain `project_id = project_id`. |
| `requested_by_id` | many2one `res.users` | no | no | Storekeeper. Defaults to the acting user. |
| `currency_id` | many2one | — | **related, stored** | |
| `note` | text | no | no | |
| `state` | selection | no | no | `draft` / `done` / `cancelled`. Default `draft`, tracked. |
| `line_ids` | one2many `construction.material.issue.line` | no | no | `copy=True` |
| `move_ids` | one2many `stock.move` | no | **yes** | The stock moves created on confirm |
| `total_value` | monetary | — | **computed, stored** | |

Public methods: `action_confirm()` (creates the stock moves), `action_cancel()`,
`action_reset()`.

### `construction.material.issue.line`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `issue_id` | many2one | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `product_id` | many2one `product.product` | **yes** | no | Domain `type = "consu"` |
| `boq_line_id` | many2one `construction.boq.line` | no | no | So consumption can be measured against the quantity that was priced |
| `quantity` | float | **yes** | no | Default 1.0 |
| `uom_id` | many2one `uom.uom` | — | **computed, stored, `readonly=False`** | Writable; defaults to the product's unit |
| `unit_cost` | monetary | — | **computed, stored, `readonly=False`** | Writable; defaults to the product's cost |
| `value` | monetary | — | **computed, stored** | |
| `currency_id` | many2one | — | **related** | |
| `qty_on_hand` | float | — | **computed** | Quantity currently in the site store |

### `construction.material.summary`

A **SQL view** (`init()` builds it), not a table. Every field is `readonly=True`
and it cannot be created, written or deleted. Order `project_id, product_id`.

Fields: `project_id`, `product_id`, `company_id`, `currency_id`, `uom_id`,
`qty_budget`, `qty_consumed`, `qty_wasted`, `qty_on_hand`, `unit_cost`,
`budget_value`, `consumed_value`, `waste_value`, `on_hand_value`, `qty_variance`
(consumed + wasted less budgeted; **positive means the job has used more than it
priced**), `variance_percent`, `waste_percent`.

Public methods: `action_open_moves()`, `action_open_waste()`.

### Waste — `stock.scrap` extensions

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `project_id` | many2one `project.project` | no | no | Construction project the wasted material belonged to. Indexed. |
| `waste_reason` | selection | no | no | `offcut` / `damage` / `weather` / `over_order` / `rework` / `spillage` / `expired` / `theft` / `other`. Offcuts are a design and ordering question; damage and spillage are a site-handling one. |
| `waste_note` | char | no | no | |

`purchase.order.construction_project_id` routes receipts into the project's site
store; `stock.picking.construction_project_id` is a stored related mirror of it;
`stock.move.construction_issue_id` links a move back to its material issue.
