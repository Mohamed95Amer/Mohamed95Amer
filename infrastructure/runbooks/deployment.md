# Deployment and release

## Release contract

`.github/workflows/majalops-release.yml` creates a semantic version, resolves the Odoo base image to a digest, fetches pinned BIM libraries, builds and pushes the private GHCR image, attaches SBOM/provenance, creates an annotated Git tag and GitHub release, and preserves the immutable image reference as a workflow artifact.

`scripts/invoke-release.ps1` dispatches that workflow for the current pushed branch, waits for the exact commit run, downloads the reference, validates its allow-listed format, and writes it under ignored `.generated/`.

## Initial deployment

The standard path is `scripts/invoke-phase2.ps1`; it runs provider configuration and `remote-bootstrap.ps1`, which uploads only `infrastructure/` and calls `provision-platform.sh` over strict host-key SSH.

Provisioning:

1. refuses to continue unless SSH passwords and root SSH are already disabled;
2. installs Docker Engine and the Compose plugin when absent;
3. writes a production Compose/Caddy copy under `/opt/majalops/infrastructure`;
4. generates unique secrets and RAM/CPU-based PostgreSQL/Odoo tuning without printing credentials;
5. applies UFW;
6. installs systemd units;
7. initializes the encrypted backup provider when selected;
8. validates and starts Majal, PostgreSQL, and Caddy;
9. validates and starts monitoring; and
10. enables startup, health recovery, and backup timers.

Rollback before first provisioning: retain a Hetzner snapshot, the original DNS record values, and the still-open tested administrator SSH session. On failure, do not delete Docker volumes.

## Automatic release deployment

After initial provisioning, GitHub uses a dedicated Ed25519 key with a forced command. The deploy identity cannot obtain an interactive shell. Root accepts only:

- a GHCR login for the validated GitHub actor;
- an update to `ghcr.io/mohamed95amer/majalops-platform@sha256:<digest>`; or
- the bounded health script.

The update path creates a paired local backup, retains the previous environment file, pulls only the requested immutable image, recreates Majal, and restores the previous image reference if health checks fail. It never automatically rolls database schema backward.

## Manual guarded update

```bash
sudo CONFIRM_UPDATE=YES \
  TARGET_IMAGE='ghcr.io/mohamed95amer/majalops-platform@sha256:APPROVED_DIGEST' \
  bash /opt/majalops/infrastructure/scripts/update-majal.sh
```

## Rollback

Use only when the release has no incompatible schema migration:

```bash
sudo CONFIRM_ROLLBACK=YES \
  PREVIOUS_IMAGE='ghcr.io/mohamed95amer/majalops-platform@sha256:PREVIOUS_DIGEST' \
  bash /opt/majalops/infrastructure/scripts/rollback.sh
```

If compatibility is uncertain, restore the paired pre-release database and filestore into a disposable environment first. Never force a code-only rollback across an incompatible migration.

## Logs

```bash
sudo SINCE=30m TAIL_LINES=500 bash /opt/majalops/infrastructure/scripts/logs.sh
sudo SERVICE=majal FOLLOW=1 bash /opt/majalops/infrastructure/scripts/logs.sh
```

Review logs for personal data, tokens, signed URLs, email addresses, and document content before sharing them.
