# Changelog

[← Index](index.md)

This documents the **API surface**, not the product. An entry appears here when a
route, model, field or method that an integration can reach changes.

## Current

| | |
| --- | --- |
| Platform | Odoo **18.0** Community |
| Odoo commit | pinned in `construction-erp/ODOO_PINNED_SHA`, vendored at `construction-erp/vendor/odoo/` |
| Majal addons | Read from the checked-out `custom-addons/` directory or the live module registry |
| Addon versions | Read from `ir.module.module.installed_version`; Property is delivered as separate versioned addons |

Read the exact versions from the deployment you are talking to rather than
trusting this table:

```python
addons = models.execute_kw(
    DB, uid, API_KEY, "ir.module.module", "search_read",
    [[["state", "=", "installed"],
      "|", "|",
      ["name", "=like", "construction\\_%"],
      ["name", "=like", "facility\\_%"],
      ["name", "=like", "majal\\_%"]]],
    {"fields": ["name", "installed_version", "state"], "order": "name"},
)
for addon in addons:
    print(f"{addon['name']:32} {addon['installed_version']}")
```

`installed_version` is what is actually running. A field documented here but
missing from `fields_get` means the deployment is behind, or the addon providing
it is not installed.

## Versioning policy

Majal addon manifests use Odoo's five-part scheme, `18.0.<major>.<minor>.<patch>`:

- The `18.0` prefix is the Odoo series. It changes only on an Odoo upgrade, which
  is a breaking change for integrations by definition.
- The remaining three are the addon's own version.

There is no separate API version. **The addon versions are the API version.**
There is no `/api/v1/` namespace and no version negotiation header — see
[Index](index.md).

## Compatibility expectations

What you can rely on:

| | |
| --- | --- |
| Record ids | Stable, never reused. Safe as an external join key. |
| Model names | Stable. A rename would be a major version. |
| Field names of stored fields | Stable within a major version. |
| `action_*` method names and their effect | Stable within a major version. |
| Selection **values** (`"in_progress"`, not "In Progress") | Stable. Write and compare against the value, never the label — labels are translated. |

What you should not rely on:

| | |
| --- | --- |
| Private methods (`_`-prefixed) | Not callable over RPC at all, and change freely. |
| Non-stored computed fields | May become stored, or gain a `search=` handler, or be recomputed differently. |
| The exact wording of exception messages | Match on the exception **class** (`AccessError`, `UserError`) or the XML-RPC `faultCode`, not on message text. |
| Internal context keys (`majal_workflow_transition`, `majal_document_transition`, `majal_sheet_transition`) | Implementation details. They may be removed or tightened to `env.su` at any time. |
| Hard-coded limits (offline batch of 100, clash cap of 2000, bootstrap collection sizes) | May be raised or made configurable. |
| Role `rank` thresholds (30, 40) | Read `majal.access.role.rank` rather than hard-coding the numbers. |

## Documentation history

| Date | Change |
| --- | --- |
| 2026-08-11 | Added the Property domain reference, buyer portal routes, safe provider/job connector architecture, Property accounting links and global multi-company isolation coverage. Route inventory updated to 30 declarations across 11 controller files. |
| 2026-08-01 | First release of this documentation set, covering the full RPC surface, all 27 `@http.route` declarations, the approval engine, the security model and the domain models. |

## Reporting a discrepancy

If a field or route documented here does not match the source, the source is
correct and this page is wrong. Every statement in these pages is meant to be
traceable to a file in `construction-erp/custom-addons/` or
`construction-erp/vendor/odoo/`, and each page names the files it came from.
