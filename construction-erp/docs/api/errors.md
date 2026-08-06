# Errors

[← Index](index.md)

Failure modes matter more than happy paths. This page maps every error you will
actually see, and names the Majal code that raises it.

## Transport shapes

### XML-RPC (`/xmlrpc/2/...`)

Everything arrives as `xmlrpc.client.Fault` with an **integer** `faultCode`
(`vendor/odoo/odoo/addons/base/controllers/rpc.py`, `xmlrpc_handle_exception_int`):

| `faultCode` | Odoo exception | `faultString` contains |
| --- | --- | --- |
| `1` | anything else (`ValidationError`, `ValueError`, `KeyError`, internal bugs) | a full Python traceback |
| `2` | `UserError`, `RedirectWarning` | a human-readable message |
| `3` | `AccessDenied` | `Access denied` |
| `4` | `AccessError` | a human-readable message |

`ValidationError` is a subclass of `UserError` in Odoo 18 and therefore arrives as
`faultCode 2` with a clean message, **not** as a traceback.

The legacy `/xmlrpc/...` route returns string fault codes instead
(`'warning -- AccessError\n\n...'`, `'AccessDenied'`, …). Do not build on it.

### JSON-RPC

HTTP status is **200** for application errors. The failure is in the body
(`vendor/odoo/odoo/http.py`, `handle_error` and `serialize_exception`):

```json
{"jsonrpc": "2.0", "id": 1,
 "error": {
   "code": 200,
   "message": "Odoo Server Error",
   "data": {
     "name": "odoo.exceptions.AccessError",
     "message": "Approval decisions can only be recorded through Approve or Reject.",
     "arguments": ["Approval decisions can only be recorded through Approve or Reject."],
     "debug": "Traceback (most recent call last): ...",
     "context": {}
   }}}
```

| `error.code` | Meaning |
| --- | --- |
| `200` | Application error. Branch on `error.data.name`. |
| `100` | `Odoo Session Expired` — re-authenticate (session-cookie routes only). |
| `404` | Route not found. |

Branch on `data.name`, which is the fully qualified exception class:

| `data.name` | Meaning |
| --- | --- |
| `odoo.exceptions.AccessDenied` | bad credentials |
| `odoo.exceptions.AccessError` | authenticated, not permitted |
| `odoo.exceptions.UserError` | business rule refused the operation |
| `odoo.exceptions.ValidationError` | a constraint rejected the values |
| `odoo.exceptions.MissingError` | the record was deleted underneath you |
| `builtins.*` | a bug — report it with `data.debug` |

## Odoo exception classes

| Class | Raised when | Retry? |
| --- | --- | --- |
| `AccessDenied` | login/API key wrong, expired, or the key's scope does not match | No — fix the credential |
| `AccessError` | model ACL, record rule, company scoping, private-method call, or a Majal guard | No |
| `UserError` | a workflow method refused (wrong state, missing prerequisite) | No |
| `ValidationError` | `@api.constrains` or an SQL constraint | No |
| `MissingError` | the id no longer exists | No |
| `CacheMiss`, `Warning` | internal | — |

## Credential errors

| Message | Cause |
| --- | --- |
| `authenticate` returns `False` | Wrong database, login or key. `common.authenticate` does not raise. |
| `AccessDenied: Access denied` | The key was correct at login but has since expired or been deleted. |
| `ValidationError: The API key must have an expiration date` | Non-system user created a key with no expiry (`res.users.apikeys._check_expiration_date`). |
| `AccessError: You can not remove API keys unless they're yours or you are a system user` | `res.users.apikeys._remove`. |

If the account enrols in MFA, password authentication over RPC stops working
entirely and only an API key is accepted — see
[Getting started](getting-started.md#why-an-api-key-rather-than-a-password).

## Multi-company

```
AccessError: Access to unauthorized or invalid companies.
```

Raised by `odoo/api.py` (`Environment.company` and `Environment.companies`) when
`allowed_company_ids` in the context contains an id that is not in the
authenticating user's `company_ids`. It fires on the *first* ORM access in the
call, so it looks like the model call failed rather than the context.

Fix: read the user's companies and intersect.

```python
user = models.execute_kw(
    DB, uid, API_KEY, "res.users", "read", [[uid]], {"fields": ["company_ids"]},
)[0]
allowed = user["company_ids"]  # e.g. [1, 3]
```

Passing no `allowed_company_ids` at all is safe: it defaults to the user's own
companies. See [Conventions → Multi-company](conventions.md#multi-company).

## Private methods

```
AccessError: Private methods (such as 'majal.offline.operation._sync_batch')
cannot be called remotely.
```

Raised by `odoo/service/model.py`, `get_public_method`. Any method whose name
starts with `_`, or that carries `@api.private`, is unreachable over RPC. This is
absolute; there is no context key or group that lifts it.

## Majal guard rails

These are the product-specific refusals. Each one names the file that raises it.

### Approvals — `construction_base/models/approval_request.py`

| Message | Class | Trigger |
| --- | --- | --- |
| `Approval decisions can only be recorded through Approve or Reject.` | `AccessError` | `write()` on `construction.approval.step` touching `state`, `decided_by_id`, `delegated_from_id`, `decided_on`, `reason`, `request_id`, `group_id`, `user_id` or `sequence` |
| `Approval steps are immutable audit evidence.` | `AccessError` | `unlink()` on `construction.approval.step` |
| `Approval state and decision evidence can only be changed through the approval actions.` | `AccessError` | `write()` on `construction.approval.request` touching `state`, `decided_on`, `requested_by_id`, `requested_on`, `res_model`, `res_id`, `record_reference`, `rule_id`, `amount` or `project_id` |
| `Approval requests are immutable audit evidence.` | `AccessError` | `unlink()` on `construction.approval.request` |
| `This step has already been decided.` | `UserError` | approving a non-pending step |
| `<name> has to approve this first.` | `UserError` | an earlier step in the chain is still pending |
| `You raised this, so somebody else has to approve it.` | `UserError` | `rule.require_other_user` and you are the requester |
| `This approval is for <person>.` | `UserError` | you are not in the step's group or delegation |
| `Say why it is rejected. Without a reason it comes straight back unchanged.` | `UserError` | `action_reject` with no reason |
| `This is already waiting for approval.` | `UserError` | `action_request_approval` on a document with an open request |
| `No approval rule covers this document. …` | `UserError` | no `construction.approval.rule` matches the model, kind and value |
| `Only <requester> or a manager can withdraw this.` | `UserError` | `action_cancel` by anyone else |

The guards stand down only for `env.su` (true superuser). There is **no** context
key that bypasses them. Full detail in [Approvals](approvals.md).

### Approvable documents — `construction_base/models/approval_mixin.py`

| Message | Class | Trigger |
| --- | --- | --- |
| `Use the document workflow actions to change status. Direct state changes are blocked.` | `AccessError` | `write({"state": …})` on any `construction.approvable` document without `env.su` and without the internal `majal_workflow_transition` context key |
| `Submitted workflow records are retained as audit evidence.` | `AccessError` | `unlink()` on an approvable document with an open approval, or in a state other than `draft`/`rejected`/`cancelled` |
| `This is waiting for approval: <step>.` | `UserError` | `_check_approved` — a decision is outstanding |
| `<document> needs approving first — <rule> applies at this value.` | `UserError` | never approved and a rule matches |
| `<document> changed after it was approved — it was cleared at <x> and now stands at <y>, so <rule> applies again.` | `UserError` | the value moved into a different rule band after approval |

Models carrying `construction.approvable`: `construction.boq`,
`construction.change.order`, `construction.progress.claim`, `construction.permit`,
`construction.daily.log`, `construction.form.inspection`.

### Approval rules — `construction_base/models/approval_rule.py`

| Message | Class |
| --- | --- |
| `A rule with no steps approves nothing. Add at least one approver, or archive the rule.` | `ValidationError` |
| `A step needs somebody who can sign it: a group or a person.` | `ValidationError` |
| `The upper limit must be above the lower one, or zero for no limit.` | SQL constraint `amount_band` |

### Asset tags — `facility_asset/models/maintenance_equipment.py`

| Message | Class | Trigger |
| --- | --- | --- |
| `This asset tag is not active.` | `AccessError` | `record_tag_scan` when `tag_status != "active"` |
| `Only facility managers can replace asset tags.` | `AccessError` | `action_rotate_tag_token` without `maintenance.group_equipment_manager` |
| `Every asset must have a unique secure tag token.` | SQL constraint | duplicate `tag_token` |
| `The asset code must be unique.` | SQL constraint | duplicate `barcode` |

`record_tag_scan` also calls `check_access("read")` first, so a user with no read
access on the asset gets the standard `AccessError` before any of the above.

### Offline sync — `majal_field_offline/models/offline_operation.py`

Batch-level errors raise; per-operation errors are returned in the results array
with `status: "failed"` or `status: "conflict"` and never abort the batch.

| Message | Class | Where |
| --- | --- | --- |
| `Sync batches may contain at most 100 operations.` | `ValidationError` | raised — aborts the call |
| `Invalid offline operation identifier.` | `ValidationError` | raised — `client_uuid` not 16–80 chars of `[A-Za-z0-9_-]` |
| `This operation is not allowed offline.` | — | returned per operation, unknown `kind` |
| `The server record changed after it was saved for offline work.` | — | returned with `status: "conflict"` |
| `This record is not assigned to you.` | — | returned, role rank < 30 and not the assignee |
| `Offline photos must be smaller than 6 MB.` | — | returned, base64 longer than 8 MiB |
| `The offline photo is invalid.` | — | returned, not valid base64 |
| `Daily labor hours must be between 0 and 24.` | — | returned |
| `Photo and signature answers must be completed online.` | — | returned |
| `This inspection is no longer editable.` | — | returned |
| `Offline defects may only be started or marked ready.` | — | returned |

### Documents — `majal_documents`

| Message / behaviour | Where |
| --- | --- |
| `majal.document.version` refuses `write()` and `unlink()` outright | `MajalDocumentVersion` |
| `majal.sheet.line` `create`/`write`/`unlink` are refused once the sheet is frozen | `MajalSheetLine` |

### Multi-tenant record rules — `majal_administration/models/tenant_security.py`

These do not raise a distinctive message. They **filter**: a record outside your
company, workspace scope or project assignment simply is not returned by `search`,
and `read` on a known id raises the generic
`AccessError: You are not allowed to access 'X' records.` Read
[Security model](security.md) before concluding that a record is missing.

## Diagnosing "the record does not exist"

In order of likelihood:

1. A record rule filtered it — check `company_id`, `majal_manager_id` /
   `majal_member_ids` on the project, or the facility assignment fields.
2. `allowed_company_ids` in your context excludes its company.
3. The integration user's `majal_industry_scope` is `construction` and the record
   is a facilities record, or vice versa — the rules return `[(1, '=', 0)]`,
   which matches nothing.
4. It really was deleted (`MissingError`).

## Next

- [Approvals](approvals.md)
- [Security model](security.md)
- [Conventions](conventions.md)
