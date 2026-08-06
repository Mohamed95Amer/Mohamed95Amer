# Approvals

[← Index](index.md)

This is the part integrations get wrong. Majal's approval engine is enforced in the
ORM, not in the UI, so the shortcuts that work in other Odoo modules — writing the
state field, flipping a step to `approved` — do not work here. They raise.

Read this page before writing to any of these models:

`construction.boq`, `construction.change.order`, `construction.progress.claim`,
`construction.permit`, `construction.daily.log`, `construction.form.inspection`.

All six inherit the abstract model `construction.approvable`
(`construction_base/models/approval_mixin.py`).

## The shape of it

Four models, in `construction_base`:

| Model | What it is |
| --- | --- |
| `construction.approval.rule` | Configuration: who signs which model, at which value, in which project |
| `construction.approval.rule.step` | One signature in a rule's chain |
| `construction.approval.request` | One approval in progress, against one document |
| `construction.approval.step` | One person's outstanding decision |

A rule is matched when a document asks for approval. Its steps are copied into a
request as `construction.approval.step` records. Each step is then signed by an
entitled user. When the last one is signed, the request goes to `approved` and the
document's `_on_approval_granted` hook runs.

## What raises, and why

### Writing to a step

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.approval.step", "write",
    [[step_id], {"state": "approved"}],
)
```

```
AccessError: Approval decisions can only be recorded through Approve or Reject.
```

`ConstructionApprovalStep.write` refuses any write touching
`_protected_decision_fields`:

`state`, `decided_by_id`, `delegated_from_id`, `decided_on`, `reason`,
`request_id`, `group_id`, `user_id`, `sequence`.

The guard stands down for **`self.env.su` only** — a genuine superuser
environment, which no RPC caller has. There is no context key, no group and no
`sudo()` flag reachable over the wire that lifts it. This is deliberate: approvers
deliberately do **not** hold ORM write access on steps, because that access was
itself the bypass — a plain `write({'state': 'approved'})` never reaches the
entitlement check.

`unlink` on a step raises `AccessError: Approval steps are immutable audit
evidence.` for the same reason.

### Writing to a request

```
AccessError: Approval state and decision evidence can only be changed through
the approval actions.
```

`ConstructionApprovalRequest.write` protects `state`, `decided_on`,
`requested_by_id`, `requested_on`, `res_model`, `res_id`, `record_reference`,
`rule_id`, `amount`, `project_id`. `unlink` raises `Approval requests are
immutable audit evidence.` Same `env.su`-only exemption.

### Writing `state` on the document

```python
models.execute_kw(
    DB, uid, API_KEY, "construction.change.order", "write",
    [[co_id], {"state": "approved"}],
)
```

```
AccessError: Use the document workflow actions to change status.
Direct state changes are blocked.
```

`ConstructionApprovable.write` blocks any write containing `state`.

**This guard is weaker than the two above, and you should know the difference.**
It stands down for `env.su` *or* for the context key `majal_workflow_transition`,
which the workflow methods set on themselves with `with_context(...)`. Because
context travels with an RPC call, a caller can pass that key and the state write
goes through. Do not do it — it is an internal implementation detail, not a
supported API, and it skips nothing that matters:

The real enforcement is `_check_approved()`, called from inside the business
methods (`construction_boq/models/boq.py`, `construction_change_order/models/
change_order.py`, `construction_progress_billing/models/progress_claim.py`,
`construction_hse/models/permit.py`, `construction_daily_log/models/daily_log.py`,
`construction_form/models/construction_form.py`). Setting `state` behind its back
produces a document whose status field says "approved" and whose approval request
says nothing of the kind — which is exactly the audit failure the engine exists to
prevent.

### Deleting an approvable document

```
AccessError: Submitted workflow records are retained as audit evidence.
```

Raised on `unlink()` when the document has an open approval request, or when its
`state` is anything other than `draft`, `rejected` or `cancelled`.

## The correct sequence

Three calls, in this order, as two different users.

```python
"""Walk a change order through its approval chain."""
import xmlrpc.client

URL = "https://your-host"
DB = "YOUR_DATABASE"

common = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/common")
models = xmlrpc.client.ServerProxy(f"{URL}/xmlrpc/2/object")

# --- 1. The requester submits and asks for approval -----------------
REQUESTER_LOGIN = "YOUR_LOGIN"
REQUESTER_KEY = "YOUR_API_KEY"
requester_uid = common.authenticate(DB, REQUESTER_LOGIN, REQUESTER_KEY, {})

change_order_id = 42

models.execute_kw(
    DB, requester_uid, REQUESTER_KEY,
    "construction.change.order", "action_submit", [[change_order_id]],
)
models.execute_kw(
    DB, requester_uid, REQUESTER_KEY,
    "construction.change.order", "action_request_approval", [[change_order_id]],
)

# --- 2. Find the outstanding steps ---------------------------------
steps = models.execute_kw(
    DB, requester_uid, REQUESTER_KEY,
    "construction.approval.step", "search_read",
    [[["res_model", "=", "construction.change.order"],
      ["res_id", "=", change_order_id],
      ["state", "=", "pending"]]],
    {"fields": ["name", "sequence", "group_id", "user_id", "requested_by_id"],
     "order": "sequence, id"},
)
for step in steps:
    print(step["sequence"], step["name"], step["group_id"], step["user_id"])

# --- 3. An entitled approver signs the first one -------------------
APPROVER_LOGIN = "ANOTHER_LOGIN"
APPROVER_KEY = "ANOTHER_API_KEY"
approver_uid = common.authenticate(DB, APPROVER_LOGIN, APPROVER_KEY, {})

models.execute_kw(
    DB, approver_uid, APPROVER_KEY,
    "construction.approval.step", "action_approve",
    [[steps[0]["id"]], "Rates check against BOQ 03.100 agreed."],
)
```

Repeat step 3 for each step in `sequence` order, each time as a user entitled to
sign that step. When the last pending step is signed, `_advance()` sets the
request to `approved` and calls the document's `_on_approval_granted` hook, which
is what actually moves the document.

### Method signatures

| Model | Method | Signature | Notes |
| --- | --- | --- | --- |
| `construction.approvable` | `action_request_approval()` | no args | Returns the created request recordset. Raises if one is already open, or if no rule matches. |
| `construction.approvable` | `action_view_approval()` | no args | Returns an action dict; UI convenience |
| `construction.approval.step` | `action_approve(reason=False)` | reason optional | |
| `construction.approval.step` | `action_reject(reason=False)` | **reason required in practice** | Rejecting with no reason raises `UserError` |
| `construction.approval.request` | `action_cancel()` | no args | Requester or a `construction_base.group_construction_manager` member only |

Both `action_approve` and `action_reject` accept a multi-record recordset and
decide each step in turn.

## Who may sign a step

`_can_be_signed_by(user)` must return true. All four conditions:

1. **The step is pending.** Otherwise: `This step has already been decided.`
2. **No earlier step is still pending.** Order is by `sequence`, then `id`. A chain
   cannot be signed from the bottom up. Otherwise: `<name> has to approve this
   first.`
3. **The user is an approver of the step.** That means the step's `user_id`, or a
   member of the step's `group_id`, or somebody holding an active
   `construction.approval.delegation` from one of those people. Otherwise:
   `This approval is for <person>.`
4. **Segregation of duty.** If the matched rule has `require_other_user = True`
   (the default), the user who raised the request cannot sign it. Otherwise:
   `You raised this, so somebody else has to approve it.`

All four failures arrive as `UserError` (XML-RPC `faultCode 2`), with a message
naming which rule stopped you — `_refusal_reason` deliberately does not say
"access denied".

### Delegation

`construction.approval.delegation` lends one user's signing authority to another
for a bounded period.

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `user_id` | many2one `res.users` | yes | no | The approver whose authority is lent. Defaults to the current user. |
| `delegate_id` | many2one `res.users` | yes | no | Who may sign in their place. |
| `date_from` | date | yes | no | Defaults to today (user's timezone). |
| `date_to` | date | yes | no | Delegations must end; there is no open-ended form. |
| `reason` | char | no | no | |
| `active` | boolean | no | no | Defaults to `True`. |

When a delegate signs, the step records `decided_by_id` = the delegate and
`delegated_from_id` = the person whose authority was used.

## Finding what is waiting on you

`construction.approval.step` denormalises the request's identifying fields so an
inbox can be listed without opening every document. All of these are **stored
related** fields — read them freely, never write them:

`res_model`, `res_id`, `record_reference`, `project_id`, `amount`, `currency_id`,
`requested_on`, `requested_by_id`.

```python
inbox = models.execute_kw(
    DB, uid, API_KEY, "construction.approval.step", "search_read",
    [[["state", "=", "pending"],
      ["request_id.state", "=", "pending"],
      "|", ["user_id", "=", uid], ["group_id", "in", group_ids]]],
    {"fields": ["name", "record_reference", "res_model", "res_id",
                "amount", "currency_id", "requested_on", "requested_by_id",
                "waiting_days"],
     "order": "requested_on asc"},
)
```

`group_ids` is the user's own group ids — read them from
`res.users.groups_id`. This domain is an approximation of the server's
`_waiting_on()` helper: it does not account for delegations or for an earlier
pending step blocking the one you see. `_waiting_on` itself is private and not
callable remotely. The authoritative test is to attempt `action_approve` and read
the `UserError`.

### `waiting_days`

Computed and **not stored**, but searchable — it defines a `search=` handler that
translates the comparison into a `requested_on` cut-off. Note the inversion:
waiting longer means requested *earlier*.

```python
stale = models.execute_kw(
    DB, uid, API_KEY, "construction.approval.step", "search_read",
    [[["waiting_days", ">", 7]]],
    {"fields": ["name", "record_reference", "requested_on"]},
)
```

Operators outside `>`, `>=`, `<`, `<=`, `=`, `!=` raise
`ValueError: Unsupported operator for waiting_days: <op>`.

## Configuring rules

You will normally leave this to the client's commercial manager, but it is
readable and writable over RPC by users who hold the rights.

### `construction.approval.rule`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `name` | char | yes | no | |
| `active` | boolean | no | no | Defaults `True` |
| `sequence` | integer | no | no | Order rules are tried in. First match wins. Default 10. |
| `company_id` | many2one `res.company` | no | no | Defaults to `env.company` |
| `model_id` | many2one `ir.model` | yes | no | The model the rule governs. Domain excludes transient models. |
| `model_name` | char | — | **related, stored** | `model_id.model`. Read-only in effect — write `model_id`. |
| `document_kind` | char | no | no | Optional narrowing within a model. Empty covers every kind. |
| `project_id` | many2one `project.project` | no | no | Empty applies to every project. Domain `is_construction = True`. |
| `amount_from` | monetary | no | no | Inclusive lower bound. Default 0. |
| `amount_to` | monetary | no | no | **Exclusive** upper bound. Zero means no upper limit. |
| `currency_id` | many2one `res.currency` | no | no | Defaults to the company currency |
| `step_ids` | one2many `construction.approval.rule.step` | yes | no | At least one, enforced on create |
| `require_other_user` | boolean | no | no | Default `True`. The requester cannot sign. |

Bands are inclusive of `amount_from` and exclusive of `amount_to`, so `0–50000`
and `50000–250000` meet exactly once, at fifty thousand.

### `construction.approval.rule.step`

| Field | Type | Required | Readonly | Description |
| --- | --- | --- | --- | --- |
| `rule_id` | many2one `construction.approval.rule` | yes | no | `ondelete="cascade"` |
| `sequence` | integer | no | no | Default 10 |
| `name` | char | yes | no | What the signature means, e.g. `Commercial review` |
| `group_id` | many2one `res.groups` | no | no | Anybody in this group can sign |
| `user_id` | many2one `res.users` | no | no | A named individual |

At least one of `group_id` / `user_id` must be set, enforced by
`@api.constrains` **and** on `create` — because a constraint on a field that is
simply absent from the values never fires.

```python
rule_id = models.execute_kw(
    DB, uid, API_KEY, "construction.approval.rule", "create",
    [{
        "name": "Variations 50k–250k",
        "model_id": model_id_of("construction.change.order"),
        "amount_from": 50000.0,
        "amount_to": 250000.0,
        "require_other_user": True,
        "step_ids": [
            (0, 0, {"sequence": 10, "name": "Commercial review",
                    "group_id": commercial_group_id}),
            (0, 0, {"sequence": 20, "name": "Project director",
                    "group_id": manager_group_id}),
        ],
    }],
)
```

Resolve `model_id_of` and the group ids with `ir.model.data`:

```python
def model_id_of(model_name):
    found = models.execute_kw(
        DB, uid, API_KEY, "ir.model", "search_read",
        [[["model", "=", model_name]]], {"fields": ["id"], "limit": 1},
    )
    return found[0]["id"]


def xmlid(module, name):
    return models.execute_kw(
        DB, uid, API_KEY, "ir.model.data", "check_object_reference",
        [module, name],
    )[1]


commercial_group_id = xmlid("construction_base", "group_construction_commercial")
manager_group_id = xmlid("construction_base", "group_construction_manager")
```

### How a rule is matched

`_match(record, amount, kind)` — private, called internally by
`action_request_approval`. It searches every rule for the document's model where
the project matches (or is empty) and the kind matches (or is empty), filters to
those whose band covers the amount, and sorts **most specific first**:

1. A rule naming the project beats a company-wide one.
2. A rule naming the kind beats one covering every kind.
3. Then `sequence`.

**No match means no approval is required.** That is the shipped default, so a
deployment with no rules configured behaves exactly as it did before the engine
existed. `action_request_approval` on a document that matches no rule raises
`UserError: No approval rule covers this document. …`.

### Where `amount` and `kind` come from

`_approval_amount()` returns the absolute value of the first of these fields that
exists on the model: `amount_sell_total`, `amount_total`, `contract_value`,
`amount`. Zero if none exists — a permit or an inspection is matched on its kind
alone.

`_approval_kind()` returns the first of `change_type`, `claim_type`,
`permit_type`, `doc_type` that exists.

All six approvable models override `_approval_amount()`:

| Model | Value matched on | Kind matched on |
| --- | --- | --- |
| `construction.boq` | `abs(amount_sell_total)` | — |
| `construction.change.order` | `abs(amount_sell_total)` — direction ignored, so an omission of half a million climbs the same chain as an addition | `change_type` (`addition` / `omission`) |
| `construction.progress.claim` | `abs(amount_this_period)` — what the certificate is worth **this period**, not cumulatively | — |
| `construction.permit` | `0.0` — matched on kind alone | `permit_type` |
| `construction.daily.log` | `0.0` | — |
| `construction.form.inspection` | `0.0` | — |

A model whose amount is always zero needs a rule whose band starts at zero
(`amount_from = 0`), or nothing will ever match it.

## Re-approval when the value changes

An approval is of a document *at a value*, not of a document forever.
`_check_approved()` compares the rule that governed the approved request with the
rule that governs the document now. If they differ:

```
UserError: <document> changed after it was approved — it was cleared at <x>
and now stands at <y>, so <rule> applies again.
```

A variation nudged from 60,000 to 61,000 stays inside the band two people signed
and does **not** go round again. Crossing into a band with a longer chain does.

## Reading approval state on a document

Four computed fields come from `construction.approvable`. All are computed,
non-stored, and cannot be written or searched:

| Field | Type | Description |
| --- | --- | --- |
| `approval_state` | selection | `none` / `pending` / `approved` / `rejected` — from the most recent request |
| `approval_summary` | char | e.g. `Waiting on Commercial review` |
| `approval_blocked` | boolean | True while an approval is outstanding |
| `approval_request_ids` | one2many | The most recent request only, not the history |

For history, or to filter, query `construction.approval.request` directly:

```python
history = models.execute_kw(
    DB, uid, API_KEY, "construction.approval.request", "search_read",
    [[["res_model", "=", "construction.change.order"], ["res_id", "=", 42]]],
    {"fields": ["state", "rule_id", "amount", "requested_by_id",
                "requested_on", "decided_on"],
     "order": "id desc"},
)
```

## Full status model

`construction.approval.request.state`: `pending` → `approved` | `rejected` |
`cancelled`.

`construction.approval.step.state`: `pending` → `approved` | `rejected` |
`skipped`. Steps are set to `skipped` when the request is rejected or cancelled
before they were reached.

## Next

- [Errors](errors.md) — every message the engine produces
- [Security model](security.md) — the groups a step's `group_id` refers to
- [Models](models/index.md)
