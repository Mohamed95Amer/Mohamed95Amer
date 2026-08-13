# Property integrations checkpoint — 2026-08-11

Branch: `feature/majal-property-phase2`

This checkpoint adds two isolated modules and does not change the live Majal
worktree at `C:\Users\hossi\Documents\Odoo`.

## Added

- `majal_integrations`: company-scoped provider definitions, environment-only
  secret references, HTTPS validation, fail-closed adapter activation, and an
  idempotent background job queue with bounded retry/backoff and row claiming.
- `majal_property_integrations`: development map links, controlled listing
  publication snapshots/channels, and a reminder center for unpaid
  installments, expiring leases, reservations, and documents.

No real property portal, email, payment, Maps API, or messaging provider is
activated. The demo channel is a controlled export and makes no network call.
Email reminder delivery is disabled in demo settings.

## Validation completed

- XML parse and Python compile checks: passed.
- Focused clean install without demo: 8 tests, 0 failures, 0 errors.
- Demo-enabled integrations/listings/accounting: 12 tests, 0 failures, 0 errors.
- Demo-enabled integration config: 8 tests, 0 failures, 0 errors.
- Full suite: 836 tests executed; 834 passed. The two errors were existing
  listing/accounting tests looking up demo XML IDs because that diagnostic run
  used `--without-demo=all`. The same tests passed in the demo-enabled run.
- Property UI and all 140 installed demo modules loaded successfully.
- Isolated demo HTTP check: `http://127.0.0.1:8074/web/login?db=majal_demo`
  returned HTTP 200 after restart.

## Rollback

Pre-install PostgreSQL dump (not inside Git):

`C:\Users\hossi\Documents\Majal-Local-Backups\property-phase2\majal_demo_before_integrations_20260811.dump`

SHA-256:

`A0F94B38A956E40D661291870ABEB2F37C40BB833BD9C9FF91D106ED58B36F5A`

The module install does not modify Property reservations, leases, units,
installments, or accounting records. Disable reminder policies/providers before
any future uninstall or rollback.

## Next safe integrations

Create one provider-specific adapter module per vendor. It must inherit
`majal.integration.provider`, implement an explicit host allowlist and
`_deliver_job`, use the environment secret reference, support the idempotency
key, redact logs, and pass contract tests before a provider can activate.
