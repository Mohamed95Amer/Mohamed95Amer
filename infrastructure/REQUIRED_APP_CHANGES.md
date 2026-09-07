# Required application changes outside the infrastructure boundary

Phase 2 intentionally left existing Majal/Odoo application modules, API code,
local Compose, and Claude's API documentation untouched. Infrastructure supplies
the production image/configuration, release workflow, BIM build fetch, private
networks, TLS, monitoring, backups, and recovery.

`checklists/pre-deployment.md` gates on this file: *"Every item in
REQUIRED_APP_CHANGES.md has an owner and decision."* That makes a stale row
expensive — an operator mid-deploy chases a problem that was fixed months ago,
or trusts a gap that is still open. All three original rows are now resolved,
and each is recorded below with the evidence rather than deleted, so the
checklist can be signed against something checkable.

## Resolved

### 1. Health endpoint — done

*Was:* Caddy proved the platform was up by internally fetching `/web/login`,
which demonstrates TLS, routing and that a process is answering. A login page
renders perfectly well while the modules behind it are mid-upgrade.

*Now:* `majal_administration/controllers/health.py` provides two probes.
`/majal/health` is unauthenticated (`auth="none"`, not `"public"`, so it loads
no session), rate-limited, and does one `SELECT 1` — the cheapest question that
still tells a live worker from one holding a dead connection. `/majal/health/deep`
requires the dedicated `group_platform_monitor` group and reports scheduler and
recovery-point state. Neither discloses version, database name, container, path,
traceback or provider configuration; failures are logged in full and returned as
one word. `caddy/Caddyfile.example` routes `/healthz` to `/majal/health` for both
the platform and demo sites. Covered by tests in
`majal_administration/tests/test_administration.py`.

### 2. Migration contract — done

*Was:* Infrastructure refuses unpinned releases and backs up before updating,
but it could not infer whether an addon upgrade left the database readable by
the previous image. Worse, `update-majal.sh` printed *"This script performs no
database migration"* immediately above the rollback the operator was being asked
to rely on — while running `odoo -i` and `odoo -u`, which execute every pending
migration in the release.

*Now:* `construction-erp/release/migration-contract.json` declares a flag per
release — `none`, `forward-compatible` or `restore-required` — with notes
explaining the choice. It is baked into the image at
`/usr/share/doc/majalops/migration-contract.json`, so the flag travels with the
exact release and `update-majal.sh` reads it out of the image it is about to
run; a release that does not declare one is refused. This needed no new deploy
parameter, so a host running an older ForceCommand keeps working.

`validate-migration-contract.py` runs in Construction ERP CI and fails when a
module ships a migration the contract does not account for — the normal failure
is someone adding a migration and forgetting the contract.

Automatic rollback is now gated. `rollback_on_failure` reverts the image freely
before any migration has run, and refuses once migrations have run on a
`restore-required` release, printing the restore path instead. Reverting there
would leave the previous release running against a restructured database and
report a successful rollback while the system could not read its own data.

*Current release is `restore-required`*, because of `oca-addons/contract`
18.0.2.0.0 — an OCA major-version restructure that moves a dozen `contract.line`
fields out to `contract_line_successor` and `contract_termination`, deletes
`contract_template_line_form_view`, and removes `ir_model` rows for four
abstract models. Every other migration in the release is additive. Note the
trigger: it only fires when upgrading a database whose `contract` module
predates 18.0.2.0.0. A first install on an empty database registers 18.0.2.0.0
directly and runs no migration, so the first go-live deployment is not exposed.

### 3. promtool entrypoint in infrastructure CI — done

*Was:* the pinned Prometheus v3 image starts at `/bin/prometheus`, so passing
`promtool` as its first argument failed with `unexpected promtool`.

*Now:* `majalops-infrastructure-ci.yml` passes `--entrypoint promtool` and the
arguments start at `check rules`, mirroring `scripts/configure-monitoring.sh`.

## Still open

Nothing in this file. Open items that are **not** application changes are
tracked where they belong:

- The platform and staging hosts must be updated to the current
  `infrastructure/` tree and `configure-deploy-user.sh` re-run, so
  `/usr/local/sbin/majalops-deploy` and `majalops-ssh-command` match the repo.
  Until then the host still health-gates staging against production. This is a
  server-side action; no commit can perform it.
