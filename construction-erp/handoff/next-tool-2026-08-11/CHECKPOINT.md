# Majal Property — technical checkpoint (updated 2026-08-11)

Read `START_HERE.md` and the pre-Hetzner audit first.

## Module map

- `majal_real_estate`: development hierarchy, units, leads, reservations,
  schedules, commissions, handover, cheques, documents and buyer portal.
- `majal_property_operations`: leases, rent schedules, inspections and property
  maintenance.
- `majal_property_ownership`: service-charge budgets/charges and owner
  statements.
- `majal_property_listing`: controlled listing workflow.
- `majal_property_account`: invoice bridge and accounting settings.
- `majal_integrations`: company-scoped providers and idempotent job queue.
- `majal_property_integrations`: listing channels/publications, notifications and
  geolocation extension.
- `majal_property_construction`, `majal_property_facilities`,
  `majal_property_administration`: suite bridges.
- `majal_property_ui`: enabled Property landing/workspace/UI layer.

## Canonical test gate

Use the module list from `scripts/run-tests.sh`; do not copy an older list from
this handoff. Always use a new database and named filestore volume.

Most recent evidence:

```text
database:  majal_property_rc_final_20260811
container: majal-property-final-full-20260811
result:    0 failed, 0 errors of 843 tests
modules:   48 requested / 141 installed with dependencies
```

The upgrade evidence uses:

```text
baseline: 0a021cb
database: majal_property_upgrade_rc_20260811
volume:   majal-property-upgrade-fs-20260811
```

## Safety rules

- Never use the live `erp` database for tests.
- Database and filestore are one unit; mount the same named volume at
  `/var/lib/odoo` in install, test and serving containers.
- A curl 200 does not prove JavaScript rendered. Keep browser UAT as a separate
  release gate.
- Do not write workflow `state` fields directly. Use public `action_*` methods.
- Do not expose the provider base class as a generic URL fetcher. Connectors must
  be separate allow-listed addons.
- Do not call private `_enqueue`, `_process_batch` or `_deliver_job` through RPC.
- Always pass `allowed_company_ids`; the new global rules remain the hard stop.

## Current open items

1. Manual desktop/mobile visual UAT.
2. WebGL BIM smoke on real hardware.
3. Production-like backup/restore rehearsal.
4. Provider-specific adapter and sandbox contract tests after providers are
   selected.
5. Review, commit and push the audit diff; no deployment before those gates.

## API

Start at `docs/api/index.md`. Property workflows are in
`docs/api/models/property.md`; safe external connector design is in
`docs/api/integrations.md`.
