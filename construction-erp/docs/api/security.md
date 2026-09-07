# Security model

[← Index](index.md)

What your integration user can see and do is decided in three layers, in this
order. All three must pass.

1. **Groups** decide which models you may read, write, create or unlink at all.
2. **Record rules** narrow that to specific rows — by company, by workspace, and
   for lower ranks by project or facility assignment.
3. **Model guards** in Majal's own code refuse specific operations regardless of
   rights. Those are documented in [Approvals](approvals.md) and
   [Errors](errors.md).

If a record is missing, it is almost always layer 2. Record rules **filter**; they
do not announce themselves. `search` simply does not return the row.

## Groups

Majal groups are defined across the addons' `security/` directories. Always
resolve them by XML ID rather than relying on a numeric database id.

### Construction — `construction_base`

| XML ID | Meaning |
| --- | --- |
| `construction_base.group_construction_user` | Field user |
| `construction_base.group_construction_site_engineer` | Engineer / supervisor |
| `construction_base.group_construction_pm` | Project manager |
| `construction_base.group_construction_commercial` | Commercial / QS |
| `construction_base.group_construction_manager` | Construction manager. Also the group that may withdraw somebody else's approval request. |

### HSE — `construction_hse`

| XML ID | Meaning |
| --- | --- |
| `construction_hse.group_hse_officer` | Safety officer |

### Facilities — `majal_administration`

| XML ID | Meaning |
| --- | --- |
| `majal_administration.group_facilities_user` | Technician |
| `majal_administration.group_facilities_supervisor` | Supervisor |
| `majal_administration.group_facilities_manager` | Facilities manager |

### Administration

| XML ID | Meaning |
| --- | --- |
| `majal_administration.group_platform_owner` | Highest rank. Required for recovery-archive download and high-risk capability grants. |
| `majal_administration.group_user_administrator` | Company administrator |
| `majal_administration.group_backup_operator` | Recovery operations |
| `majal_administration.group_platform_monitor` | May call the authenticated deep health endpoint; grants no general administration rights |
| `majal_ai.group_ai_manager` | AI provider configuration, including reading the encrypted key fields |

### Property and integrations

| XML ID | Meaning |
| --- | --- |
| `majal_real_estate.group_majal_real_estate_user` | Property sales and portfolio user |
| `majal_real_estate.group_majal_real_estate_manager` | Property portfolio manager |
| `majal_property_operations.group_majal_property_manager` | Leasing and property operations manager |
| `majal_property_ownership.group_majal_owners_association` | Owners' association and service-charge operations |
| `majal_property_listing.group_majal_property_listing_user` | Listing author |
| `majal_property_listing.group_majal_property_listing_manager` | Listing reviewer and publisher |
| `majal_integrations.group_majal_integration_manager` | Integration provider and job administration |
| `majal_property_integrations.group_majal_property_integration_manager` | Property channel publication and connector administration |
| `majal_property_account.group_majal_property_account_manager` | Property accounting setup and invoicing |

Resolve any of these to an id:

```python
group_id = models.execute_kw(
    DB, uid, API_KEY, "ir.model.data", "check_object_reference",
    ["construction_base", "group_construction_pm"],
)[1]
```

Check your own membership without guessing:

```python
allowed = models.execute_kw(
    DB, uid, API_KEY, "res.users", "has_group",
    [[uid], "construction_base.group_construction_pm"],
)
```

## Majal roles and workspace scope

`majal_administration` layers a role model over the raw groups. Two fields on
`res.users` drive every record rule in the product
(`majal_administration/models/res_users.py`, `tenant_security.py`):

| Field | Type | Description |
| --- | --- | --- |
| `majal_role_id` | many2one `majal.access.role` | The user's rank |
| `majal_industry_scope` | selection | `construction`, `facilities`, `both`, `real_estate`, or `property_facilities`. Required, defaults to `both`. |
| `majal_capability_pack_ids` | many2many `majal.capability.pack` | Optional commercial capabilities |
| `majal_access_summary` | char | **computed** — human-readable summary |

### `majal.access.role`

| `code` | Typical `rank` | Construction group applied | Facilities group applied |
| --- | --- | --- | --- |
| `platform_owner` | highest | `group_construction_manager` | `group_facilities_manager` |
| `company_admin` | | `group_construction_manager` | `group_facilities_manager` |
| `operations_manager` | | `group_construction_manager` | `group_facilities_manager` |
| `manager` | | `group_construction_pm` | `group_facilities_manager` |
| `supervisor` | | `group_construction_site_engineer` | `group_facilities_supervisor` |
| `field_user` | lowest | `group_construction_user` | `group_facilities_user` |

`rank` is an integer field on `majal.access.role`, not a constant in the code, so
read it rather than assuming a value. Two thresholds are hard-coded against it and
matter to integrations:

- **`rank >= 40`** — record rules stop restricting to assigned projects and
  facilities, and show everything in the user's companies.
- **`rank >= 30`** — the offline sync API stops requiring that a record be
  assigned to you (`majal_field_offline`), and `majal.sheet.action_new_revision`
  becomes available.

Below `rank 30`, offline sync raises `This record is not assigned to you.`

### Workspace scope is a hard wall

Every Majal record rule opens with the same shape:

```
[(1, '=', 1)] if user.share else
([(1, '=', 0)] if user.majal_industry_scope == 'facilities' else (...))
```

A construction-scoped user reading a facilities model — or vice versa — gets
`[(1, '=', 0)]`, a domain that matches nothing. Not an error, not a partial
result: **zero rows, silently**. If your integration reads both sides of the
product, its user needs `majal_industry_scope = "both"`.

Property-only integrations should use `real_estate`; integrations that also
raise facilities work against Property assets should use `property_facilities`.
Use `both` only when the account genuinely needs all suites.

Note the first clause: `user.share` (portal users) are exempted from the tenant
rules entirely and are governed instead by the portal rules below.

## Record rules

Installed programmatically by
`majal_administration/models/tenant_security.py::_majal_install_tenant_rules`,
which writes global `ir.rule` records named `Majal tenant: <model>` and
`Majal workspace: <model>`.

### Construction — project-scoped

Applies to `project.project`, `project.task`, `majal.project.document`,
`construction.boq`, `construction.drawing`, `construction.rfi`,
`construction.submittal`, `construction.defect`, `construction.daily.log`,
`construction.form.inspection`, `construction.progress.claim`,
`construction.change.event`, `construction.change.order`,
`construction.subcontract`, `construction.subcontract.payment`,
`construction.incident`, `construction.permit`, `construction.toolbox.talk`,
`construction.tender`, `construction.material.issue`, `construction.meeting`,
`construction.bim.model`, `construction.bim.clash.test`, `construction.bim.clash`,
`construction.pin`.

| User | Sees |
| --- | --- |
| `rank >= 40`, or no role set | Everything in `company_ids` |
| Below rank 40 | Everything in `company_ids` **where** they are the project's `majal_manager_id` **or** in its `majal_member_ids` |

`project.project` additionally carries `is_construction = True`.

Two fields on `project.project` therefore control visibility for most users:

| Field | Type | Description |
| --- | --- | --- |
| `majal_manager_id` | many2one `res.users` | Majal project manager. Domain `share = False`. |
| `majal_member_ids` | many2many `res.users` | Majal project team. Domain `share = False`. |

If your integration user is below rank 40 and sees no projects, it is not on any
project team.

### Construction — child models

The same rule, reached through a path: `construction.boq.line` via
`boq_id.project_id.`, `construction.progress.claim.line` via `claim_id.project_id.`,
and so on for around twenty line and detail models. Adding a line to a document you
cannot see does not work, because you cannot see its parent.

### Construction — company-scoped only

`construction.form.template`, `construction.form.question`,
`construction.approval.rule`, `whatsapp.account`. Filtered by company alone, with
no project narrowing.

Note what is *not* in this list: `construction.approval.request` and
`construction.approval.step` carry no Majal tenant rule. They are reachable to any
user whose ACLs permit the model — which is why the write guards on them are
absolute rather than rule-based.

### Facilities — company-scoped

`facility.sla.policy`, `contract.contract`.

### Property — company isolation

All 28 core Property business models have global company record rules. This
includes the inventory hierarchy, reservations and payment records, handovers,
documents, leases and inspections, property maintenance, service-charge budgets
and charges, owner statements, listings, publications and accounting settings.

The domain is based on `company_ids`, including records whose `company_id` is
empty only where the model permits shared configuration. A user assigned only to
Company A cannot discover Company B's developments, units, leases, service
budgets or listings even when an RPC caller sends an empty domain. This boundary
is covered by the automated `majal_property_account` company-isolation test.

For predictable results, integrations must still pass
`context={"allowed_company_ids": [...]}` and an explicit company domain.

### Facilities — assignment-scoped

`facility.location`, `maintenance.equipment`, `maintenance.request`,
`facility.asset.scan`, `facility.floorplan`, `facility.asset.meter`,
`facility.asset.meter.reading`, `facility.spare.line`, `facility.pin`,
`facility.request.task`, `facility.request.part`.

| User | Sees |
| --- | --- |
| `rank >= 40`, or no role set | Everything in the company |
| Below rank 40 | Records reached through an assignment |

The assignment paths differ per model. For `maintenance.request` the user must be
one of: the request's `user_id`; the asset's `technician_user_id` or
`owner_user_id`; or the asset's facility location's `manager_user_id` or a member
of its `member_user_ids`.

Two fields on `facility.location` drive most of it:

| Field | Type | Description |
| --- | --- | --- |
| `manager_user_id` | many2one `res.users` | Facility manager. Domain `share = False`. |
| `member_user_ids` | many2many `res.users` | Facility team. Domain `share = False`. |

### Facilities — scope only

`facility.failure.code`, `facility.job.plan`, `facility.job.plan.task`,
`facility.pm.plan`, `facility.parts.summary`. Visible to any facilities-scoped
user; no company or assignment narrowing.

## Multi-company

Majal is multi-company throughout. Most transactional models carry `company_id`,
usually related from the parent — `construction.document.mixin.company_id` is
`related="project_id.company_id", store=True`.

Which companies are *active* for a call comes from the `allowed_company_ids`
context key, defaulting to the user's `company_ids`.

```python
rows = models.execute_kw(
    DB, uid, API_KEY, "maintenance.request", "search_read",
    [[]], {"fields": ["name"], "context": {"allowed_company_ids": [1, 3]}},
)
```

**Every id you pass must be one of the user's own companies.** If it is not:

```
AccessError: Access to unauthorized or invalid companies.
```

Raised by `vendor/odoo/odoo/api.py` in both `Environment.company` and
`Environment.companies`, on the first ORM access in the call. It looks like the
model call failed, not the context — this trips people up.

Read the user's companies first and never widen beyond them:

```python
user = models.execute_kw(
    DB, uid, API_KEY, "res.users", "read", [[uid]],
    {"fields": ["company_id", "company_ids"]},
)[0]
print(user["company_id"], user["company_ids"])
```

`env.company` — the default for `currency_id` on approval rules, `company_id` on
`majal.sheet` and `majal.document`, and the company stamped on offline sync
operations — is the **first** entry of `allowed_company_ids`. Pass it explicitly
when creating records for a company other than the user's default.

Omitting `allowed_company_ids` entirely is always safe.

## Portal users

Portal users (`base.group_portal`, `res.users.share = True`) are exempt from the
tenant rules and governed by four read-only rules in `construction_portal` plus one
in `facility_portal`.

| Model | Rule | Domain | read | write | create | unlink |
| --- | --- | --- | --- | --- | --- | --- |
| `construction.rfi` | Portal: own RFIs (ball in court) | `ball_in_court_id child_of commercial_partner_id` | yes | no | no | no |
| `construction.defect` | Portal: assigned defects | `responsible_subcontractor_id child_of commercial_partner_id` | yes | no | no | no |
| `construction.subcontract` | Portal: own subcontracts | `subcontractor_id child_of commercial_partner_id` | yes | no | no | no |
| `construction.subcontract.payment` | Portal: own subcontract payments | `subcontract_id.subcontractor_id child_of commercial_partner_id` | yes | no | no | no |
| `maintenance.request` | Portal: own facility requests | `portal_reporter_id child_of commercial_partner_id` | yes | no | **yes** | no |

`child_of user.partner_id.commercial_partner_id.id` means a portal contact who is
a child of the company partner sees the company's documents, not only their own.

The single write action available to a portal user is
`construction.defect.action_ready()`, reached through
`POST /my/defect/<id>/ready`. Everything else is read-only. The one create is a
facility request through the portal form.

`construction.rfi.portal_visible` (boolean, default `True`) gates whether an RFI is
shown in portal templates. It is a display flag on top of the record rule, not a
second access control.

**Portal users must never receive internal-user groups.** A portal account that
holds one is outside the model the rules were written for.

## Secrets in the data model

These fields are credentials. Never log them, never return them from an
integration, never put them in a URL you share.

| Model | Field | Why | Protection in the product |
| --- | --- | --- | --- |
| `maintenance.equipment` | **`tag_token`** | The QR/NFC tag credential. Anyone holding it can address the asset's tag route. | `readonly=True`, `copy=False`, `secrets.token_urlsafe(24)`, unique SQL constraint. Rotatable by a facility manager only. |
| `whatsapp.account` | `access_token` | Sends messages billed to the company's Meta account | `groups="base.group_system"` |
| `whatsapp.account` | `app_secret` | Signs inbound webhooks | `groups="base.group_system"` |
| `whatsapp.account` | `webhook_verify_token` | Meta's subscription handshake | `groups="base.group_system"` |
| `majal.ai.provider` | `api_key_encrypted`, `api_key_input` | Third-party LLM keys | `groups="base.group_system,majal_ai.group_ai_manager"`, encrypted at rest with `MAJAL_AI_MASTER_KEY` |
| `majal.restore.request` | `token_hash` | Restore authorisation | `readonly=True` |
| `majal.user.invite.wizard` | `temporary_password` | Shown once | transient wizard |

### `tag_token` in particular

`qr_tag_url`, `nfc_tag_url` and `qr_tag_encoded_url` are computed **from**
`tag_token` and therefore embed it. Treat all four as the same secret. An
integration that syncs assets to another system must exclude them from its field
list:

```python
# Do this
fields = ["id", "name", "barcode", "criticality", "facility_location_id",
          "tag_status", "last_scan_at"]

# Not this — leaks the tag credential into another system
# fields = ["id", "name", "tag_token", "qr_tag_url"]
```

Possession of the token is not by itself authorisation: the tag routes are
`auth="user"` and the scan still passes `check_access("read")` on the asset. But
it is an unguessable identifier that addresses a specific asset, it is what is
printed on the physical label, and rotating it invalidates every printed tag for
that asset. Handle it as a credential.

## Checking rights before you build

```python
# Raises AccessError if refused; returns None if allowed.
models.execute_kw(DB, uid, API_KEY, "construction.boq", "check_access", ["write"])

# The fields this user can actually see on a model.
definition = models.execute_kw(
    DB, uid, API_KEY, "construction.progress.claim", "fields_get",
    [], {"attributes": ["string", "type", "required", "readonly",
                        "relation", "selection", "store"]},
)
```

`fields_get` is authoritative for the deployment you are talking to. Fields
restricted by a `groups=` attribute simply do not appear for a user who lacks the
group — that is how `whatsapp.account.access_token` disappears for non-system
users, rather than raising.

## Deployment baseline

The product ships a documented hardening baseline in
`construction-erp/docs/security.md`. The points that affect integrations:

- Single database only. Database listing and the browser database manager are
  disabled; `/web/database/selector` and `/web/database/manager` redirect to the
  login page.
- Password policy requires at least 12 characters; passkey and TOTP/email MFA
  modules are installed. Once a user enrols in MFA, **RPC password
  authentication stops working for them and only an API key is accepted**.
- Asset QR/NFC routes require an authenticated user and normal record access.
- Scan events are append-only: users may create and read them, not edit or
  delete them.
- Production deployment expects a reverse proxy terminating TLS, `proxy_mode`
  enabled, and authentication rate-limited at the proxy. Majal itself has no
  application-level rate limiter.

## Next

- [Approvals](approvals.md)
- [Errors](errors.md)
- [Custom endpoints](endpoints/index.md)
