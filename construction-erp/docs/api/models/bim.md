# BIM

[← Models](index.md) · [← Index](../index.md)

Source: `custom-addons/construction_bim/models/`

`construction_bim` defines **no HTTP routes**. IFC upload and indexing, the 3D
viewer, clash detection, BCF exchange and BOQ take-off are all reached through
the ORM, several of them through `@api.model` methods that are callable over RPC.

## `construction.bim.model`

Inherits `construction.document.mixin`, `mail.thread`, `mail.activity.mixin`.
Order `id desc`.

Fields beyond the [document mixin](projects.md#constructiondocumentmixin):

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `discipline` | selection | **yes** | no | `architectural` / `structural` / `mechanical` / `electrical` / `plumbing` / `civil` / `federated` / `other`. Default `architectural`. |
| `revision` | char | **yes** | no | Default `A` |
| `ifc_file` | binary | **yes** | no | `attachment=True`. The IFC file, base64. |
| `ifc_filename` | char | no | no | |
| `file_size` | integer | no | **yes** | |
| `state` | selection | no | no | `draft` (Uploaded) / `indexed` / `current` / `superseded`. Default `draft`, tracked. |
| `element_ids` | one2many `construction.bim.element` | no | no | |
| `element_count` | integer | — | **computed, stored** | |
| `linked_count` | integer | — | **computed, stored** | Elements carrying a linked record |
| `index_error` | char | no | **yes** | Why the last index attempt failed |
| `pin_ids` | one2many `construction.bim.pin` | no | no | |
| `pin_count` | integer | — | **computed** | |

Public methods:

| Method | Kind | Description |
| --- | --- | --- |
| `action_index()` | recordset | Parse the IFC and build `construction.bim.element` records. Sets `state` to `indexed`, or fills `index_error`. |
| `action_make_current()` | recordset | Mark this revision current and supersede the others |
| `action_compare()` | recordset | Open a `construction.bim.comparison` |
| `action_takeoff()` | recordset | Push model quantities onto BOQ lines |
| `action_export_bcf()` | recordset | Export pins as a BCF archive |
| `action_import_bcf()` | recordset | Open the BCF import wizard |
| `action_view_pins()`, `action_view_elements()`, `action_view_properties()`, `action_open_viewer()` | recordset | UI actions |
| `federation_candidates(model_id)` | `@api.model` | Models that can be federated with this one |
| `viewer_payload(model_id)` | `@api.model` | Everything the 3D viewer needs for one model |

`@api.model` methods take an empty id list as the first positional argument:

```python
payload = models.execute_kw(
    DB, uid, API_KEY, "construction.bim.model", "viewer_payload",
    [[], bim_model_id],
)
```

### Uploading and indexing

```python
import base64

with open("tower-a-structural-revC.ifc", "rb") as handle:
    ifc = base64.b64encode(handle.read()).decode()

model_id = models.execute_kw(
    DB, uid, API_KEY, "construction.bim.model", "create",
    [{
        "name": "Tower A — Structural",
        "project_id": project_id,
        "discipline": "structural",
        "revision": "C",
        "ifc_file": ifc,
        "ifc_filename": "tower-a-structural-revC.ifc",
    }],
)
models.execute_kw(
    DB, uid, API_KEY, "construction.bim.model", "action_index", [[model_id]],
)

state = models.execute_kw(
    DB, uid, API_KEY, "construction.bim.model", "read", [[model_id]],
    {"fields": ["state", "element_count", "index_error", "file_size"]},
)[0]
if state["index_error"]:
    raise SystemExit(state["index_error"])
```

Indexing failures are recorded in `index_error` rather than raised, so **check
the field** — a successful `action_index` call does not mean the model indexed.

> **Size.** IFC files are large. A deployment fronted by Cloudflare's free plan
> caps uploads at **100 MB**, and the failure arrives as a 413 from Cloudflare
> that Odoo never sees or logs (`deploy/dns/README.md`). If your models exceed
> that, the hostname must be DNS-only or unproxied.

## `construction.bim.element`

Order `storey, ifc_type, name`. Built by `action_index()`; most fields are
`readonly=True` because they come from the IFC.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `model_id` | many2one `construction.bim.model` | **yes** | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | Indexed |
| `global_id` | char | **yes** | **yes** | The IFC GlobalId. Indexed. The stable identity across revisions. |
| `step_id` | integer | no | **yes** | STEP line number in the IFC |
| `ifc_type` | char | no | **yes** | e.g. `IfcWall`, `IfcBeam`. Indexed. |
| `name` | char | no | no | |
| `storey` | char | no | no | Indexed |
| `is_orphan` | boolean | no | **yes** | No longer present in the latest indexed file, but kept because records are attached to it |
| `quantity_length` | float | no | **yes** | `digits=(16, 3)` |
| `quantity_area` | float | no | **yes** | `digits=(16, 3)` |
| `quantity_volume` | float | no | **yes** | `digits=(16, 3)` |
| `quantity_count` | float | no | **yes** | `digits=(16, 2)` |
| `quantity_weight` | float | no | **yes** | `digits=(16, 3)` |
| `has_quantities` | boolean | — | **computed, stored** | |
| `property_ids` | one2many `construction.bim.property` | no | no | |
| `property_count` | integer | — | **computed** | |
| `task_id` | many2one `project.task` | no | no | `ondelete="set null"` |
| `rfi_id` | many2one `construction.rfi` | no | no | `ondelete="set null"` |
| `defect_id` | many2one `construction.defect` | no | no | `ondelete="set null"` |
| `boq_line_id` | many2one `construction.boq.line` | no | no | `ondelete="set null"` |
| `note` | text | no | no | |
| `is_linked` | boolean | — | **computed, stored** | Carries at least one linked record |
| `link_summary` | char | — | **computed, stored** | |
| `link_bucket` | selection | — | **computed, stored** | `blocked` / `open` / `done` / `none`. Default `none`. |

Public methods: `action_open_link()`, and `link_element(model_id, global_id,
values)` — an `@api.model` helper that links a record to an element **by
GlobalId**, which is the right way to do it from an integration:

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.bim.element", "link_element",
    [[], bim_model_id, "3Xy7$hLmT9uAz1QbCd2eFg", {"rfi_id": rfi_id}],
)
```

Linking by `global_id` survives re-indexing. Linking by element `id` does not —
`action_index()` rebuilds element records, and an element that disappears from a
later revision is marked `is_orphan` rather than deleted precisely so the links
survive.

`is_linked`, `link_bucket` and `has_quantities` are stored, so they are
searchable and groupable.

### `construction.bim.property`

Order `pset, name`. The IFC property sets.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `element_id` | many2one `construction.bim.element` | yes | no | Indexed, `ondelete="cascade"` |
| `model_id` | many2one | — | **related, stored** | Indexed |
| `pset` | char | no | no | Property set name. Indexed. |
| `name` | char | yes | no | Indexed |
| `value` | char | no | no | Always a string, whatever the IFC type |

## BOQ take-off

`construction_bim` extends `construction.boq.line` with six fields that compare
the bill against the model. Full table in
[Commercial → construction.boq.line](commercial.md#from-other-addons).

The one to know: `bim_variance` is **model quantity less billed quantity**, so
**negative means the model contains less than the bill is measured against** —
a possible over-measure.

```python
over_measured = models.execute_kw(
    DB, uid, API_KEY, "construction.boq.line", "search_read",
    [[["boq_id", "=", boq_id], ["bim_element_count", ">", 0],
      ["bim_variance_percent", "<", -5.0]]],
    {"fields": ["item_code", "name", "quantity", "bim_quantity",
                "bim_measure", "bim_variance", "bim_variance_percent"],
     "order": "bim_variance_percent"},
)
```

All five `bim_*` quantity fields are computed **and stored**, so they can be
filtered on. `bim_measure` is the one writable computed field here — it is
derived from the unit of measure and can be overridden where the model measures
it differently.

## `construction.bim.pin`

Order `sequence, id`. A 3D pin with an optional saved camera viewpoint. Note this
is a **separate model** from `construction.pin` / `plan.pin.mixin`, which pin to
2D sheets.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `model_id` | many2one `construction.bim.model` | **yes** | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | Indexed |
| `element_id` | many2one `construction.bim.element` | no | no | Element the pin landed on, if any. Indexed, `ondelete="set null"`. |
| `global_id` | char | no | **yes** | Kept alongside the element link so a pin survives the element record being rebuilt |
| `sequence` | integer | no | no | Default 10 |
| `name` | char | **yes** | no | Default `Pin` |
| `note` | text | no | no | |
| `pos_x`, `pos_y`, `pos_z` | float | **yes** | no | `digits=(16, 4)`. World position. |
| `storey` | char | no | no | Indexed |
| `cam_x`, `cam_y`, `cam_z` | float | no | no | `digits=(16, 4)`. Camera position. |
| `cam_target_x`, `cam_target_y`, `cam_target_z` | float | no | no | `digits=(16, 4)`. Camera target. |
| `has_viewpoint` | boolean | — | **computed, stored** | A camera was saved |
| `pin_type` | selection | **yes** | no | Dynamic, built by `_selection_pin_type`. Default `note`. |
| `task_id` | many2one `project.task` | no | no | `ondelete="cascade"` |
| `rfi_id` | many2one `construction.rfi` | no | no | `ondelete="cascade"` |
| `defect_id` | many2one `construction.defect` | no | no | `ondelete="cascade"` |
| `author_id` | many2one `res.users` | no | **yes** | Defaults to the acting user |
| `status` | char | — | **computed, stored** | Status of the linked record |
| `bucket` | selection | — | **computed, stored** | `blocked` / `open` / `done` / `none`. Default `none`. |
| `bcf_guid` | char | no | **yes** | Topic GUID this pin came from, or was last exported as, so a round trip through another tool updates the pin rather than creating a second one beside it. Indexed, `copy=False`. |

Public methods:

| Method | Kind | Description |
| --- | --- | --- |
| `drop_pin(model_id, values)` | `@api.model` | Create a pin **and** the record it points at |
| `pins_for_model(model_id)` | `@api.model` | Every pin on a model, in viewer form |
| `remove_pin()` | recordset | |
| `action_open_record()` | recordset | |

```python
pins = models.execute_kw(
    DB, uid, API_KEY, "construction.bim.pin", "pins_for_model",
    [[], bim_model_id],
)
```

## Clash detection

### `construction.bim.clash.test`

Inherits `mail.thread`. Order `id desc`.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | **yes** | no | Tracked |
| `project_id` | many2one `project.project` | **yes** | no | Indexed, domain `is_construction = True` |
| `model_a_id` | many2one `construction.bim.model` | **yes** | no | Domain `project_id = project_id`, `ondelete="cascade"` |
| `model_b_id` | many2one `construction.bim.model` | **yes** | no | Domain `project_id = project_id`, `ondelete="cascade"` |
| `tolerance` | float | **yes** | no | Default 0.01, `digits=(16, 4)`. Overlap below this is ignored, **in the model's own units**. A tolerance of zero reports every touching surface — two walls meeting at a corner are not a clash. |
| `clash_ids` | one2many `construction.bim.clash` | no | no | |
| `clash_count` | integer | — | **computed, stored** | |
| `open_count` | integer | — | **computed, stored** | |
| `resolved_count` | integer | — | **computed, stored** | |
| `last_run` | datetime | no | **yes** | Tracked |
| `last_run_skipped` | integer | no | **yes** | Results found but not stored, because the run hit the **2000-result cap** (`MAX_RESULTS`). A run that finds fifty thousand clashes has found nothing anybody can act on. |
| `state` | selection | — | **computed, stored** | `draft` (Never run) / `run` |

`_check_two_models` raises `ValidationError` if the two models are the same.

Public methods:

| Method | Kind | Description |
| --- | --- | --- |
| `test_payload(test_id)` | `@api.model` | The geometry the client-side detector needs |
| `record_results(test_id, results, skipped)` | `@api.model` | Store the results the detector produced |
| `action_open_viewer()`, `action_view_clashes()` | recordset | |

Clash detection runs **client-side** in the viewer: the browser fetches
`test_payload`, computes intersections, and posts them back through
`record_results`. There is no server-side geometry engine. An integration that
wants to run its own detector can use exactly the same two calls.

**Always read `last_run_skipped` after a run.** A run that hits the storage cap
reports fewer clashes than it found, and a zero-clash report with a non-zero
`last_run_skipped` is not a clean model.

### `construction.bim.clash`

Inherits `mail.thread`. Order `overlap desc, id desc` — deepest intersection
first.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `test_id` | many2one `construction.bim.clash.test` | **yes** | no | Indexed, `ondelete="cascade"` |
| `project_id` | many2one | — | **related, stored** | Indexed |
| `name` | char | — | **computed, stored** | |
| `global_id_a` | char | no | **yes** | Indexed |
| `global_id_b` | char | no | **yes** | Indexed |
| `element_a_id` | many2one `construction.bim.element` | no | no | `ondelete="set null"` |
| `element_b_id` | many2one `construction.bim.element` | no | no | `ondelete="set null"` |
| `name_a` | char | no | **yes** | |
| `name_b` | char | no | **yes** | |
| `pos_x`, `pos_y`, `pos_z` | float | no | **yes** | `digits=(16, 4)` |
| `overlap` | float | no | **yes** | **Smallest overlap across the three axes, in the model's units — the depth of the intersection, not its volume.** `digits=(16, 4)`. |
| `status` | selection | **yes** | no | `new` / `active` / `reviewed` / `approved` / `resolved`. Default `new`, tracked. `reviewed` and `approved` are decisions a person made — **a re-run does not undo them.** |
| `assigned_user_id` | many2one `res.users` | no | no | Tracked |
| `note` | text | no | no | |
| `resolved_by_run` | boolean | no | **yes** | Closed automatically because the last run no longer found it |
| `rfi_id` | many2one `construction.rfi` | no | no | `ondelete="set null"` |
| `pin_id` | many2one `construction.bim.pin` | no | no | `ondelete="set null"` |

Public methods: `action_activate()`, `action_review()`, `action_approve()`,
`action_reopen()`, `action_raise_rfi()`.

Clashes are keyed by the **GlobalId pair**, so re-running a test updates existing
clash records rather than duplicating them, and a clash the new run no longer
finds is closed with `resolved_by_run = True`.

## Revision comparison

### `construction.bim.comparison`

**Transient** (`models.TransientModel`) — a comparison is one run, and the
records are vacuumed. Read the lines in the same session that produced them; do
not store their ids.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `base_model_id` | many2one `construction.bim.model` | no | no | From revision. `ondelete="cascade"`. |
| `target_model_id` | many2one `construction.bim.model` | **yes** | no | To revision. `ondelete="cascade"`. |
| `line_ids` | one2many `construction.bim.comparison.line` | no | no | |
| `added_count` | integer | — | **computed** | |
| `removed_count` | integer | — | **computed** | |
| `changed_count` | integer | — | **computed** | |

Public method: `action_compare()`.

### `construction.bim.comparison.line`

Also **transient**. Ordered removals first: an element that has gone and carries
an open RFI is the finding.

| Field | Type | Readonly | Description |
| --- | --- | --- | --- |
| `comparison_id` | many2one | no | `ondelete="cascade"` |
| `global_id` | char | yes | |
| `name` | char | yes | |
| `ifc_type` | char | yes | |
| `storey` | char | yes | |
| `change_type` | selection | yes | `added` / `removed` / `moved` (Moved storey) / `renamed` / `quantity` (Quantity changed) |
| `measure` | char | yes | Which quantity changed |
| `was` | char | yes | |
| `now` | char | yes | |
| `is_linked` | boolean | yes | **Carried an RFI, defect, task or bill item. A removal here needs somebody's attention.** |

Filter on `is_linked` after a comparison — a removed element that carried an open
RFI is the finding, not the raw added/removed counts.

## BCF exchange

`construction.bim.bcf` is an **abstract** model with no fields and no table,
exposing two public `@api.model` methods:

| Method | Description |
| --- | --- |
| `export_pins(pins)` | Build a BCF archive from a pin recordset |
| `import_archive(model, payload)` | Import a BCF archive into a model, matching on `bcf_guid` |

`construction.bim.bcf.import` is a transient wizard: `model_id` (required,
cascade), `bcf_file` (binary, required), `bcf_filename` (char),
`action_import()`.

Round-tripping is idempotent by `bcf_guid`: importing a topic that Majal
previously exported updates the existing pin rather than creating a second one
beside it.
