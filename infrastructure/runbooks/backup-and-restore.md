# Backup and restore

## Scope and objectives

The backup set pairs a PostgreSQL custom-format dump with the `/var/lib/odoo` filestore, image metadata, and SHA-256 checksums. Hetzner snapshots are an additional recovery tool, not a database-consistent backup substitute.

Draft objectives for the non-customer platform server:

- RPO: 24 hours for demo/staging state.
- RTO: 4 hours during staffed operating time.
- Local retention: 30 days.
- Off-host retention: 7 daily, 4 weekly, and 3 monthly recovery points.
- Restore drill: monthly before launch, quarterly after the process is stable, and before major upgrades.

Mohamed must approve the final objectives and off-host storage provider.

## Backup

Risk: the application is briefly paused to align the database and filestore. Rollback: the script trap unpauses it on failure; verify with `docker compose ps` and `healthcheck.sh`.

```bash
sudo COMPOSE_FILE=/opt/majalops/infrastructure/docker/compose.platform.yml \
  ENV_FILE=/etc/majalops/platform.env \
  BACKUP_ROOT=/srv/majalops/backups \
  bash /opt/majalops/infrastructure/scripts/backup.sh
```

The script writes to a `.partial` directory, verifies command success, generates checksums, atomically renames the completed set, and prunes completed local sets older than the configured age. A `.partial` directory is never a valid backup.

After every run:

```bash
sudo find /srv/majalops/backups -maxdepth 2 -type f -printf '%p %s bytes\n'
cd /srv/majalops/backups/majalops-TIMESTAMP
sudo sha256sum --check SHA256SUMS
```

Copy completed sets off-host using a reviewed encrypted tool such as restic to a dedicated Hetzner Object Storage bucket or a different provider/account. Keep repository credentials only in `/etc/majalops/` and the vault. Enable bucket immutability/object lock if available. Do not mount the backup bucket as a writable application filesystem.

## Scheduling

After one manual backup and restore test succeeds, create a root-owned systemd service/timer outside the repository. Run daily during low usage. Add an alert that fires if the newest completed backup is older than 26 hours. Timer output belongs in the journal and `/var/log/majalops/backup.log`.

Do not schedule untested backup commands.

## Restore drill

Always restore into a disposable isolated environment first. Never treat checksum verification alone as proof of recoverability.

1. Provision an empty test server or isolated Compose project.
2. Use the same reviewed image digest as the backup metadata where possible.
3. Copy the backup set and scripts securely.
4. Verify `SHA256SUMS`.
5. Run the guarded restore with a test-only environment file.
6. Verify login, attachments, database data, scheduled jobs, Arabic/English UI, BIM assets, and health checks.
7. Record elapsed time, issues, and evidence; destroy the test environment securely.

## In-place restore

Risk: this drops and recreates the configured database and replaces the filestore. Rollback: by default `restore.sh` first creates a safety backup. Also take a Hetzner snapshot and record the current image digest. Keep the snapshot until business validation completes.

```bash
sudo CONFIRM_RESTORE=YES \
  BACKUP_SET=/srv/majalops/backups/majalops-TIMESTAMP \
  COMPOSE_FILE=/opt/majalops/infrastructure/docker/compose.platform.yml \
  ENV_FILE=/etc/majalops/platform.env \
  bash /opt/majalops/infrastructure/scripts/restore.sh
```

Never set `CREATE_SAFETY_BACKUP=NO` on the platform server unless the current state is already irrecoverable and an incident commander explicitly approves it.

After restore:

```bash
sudo bash /opt/majalops/infrastructure/scripts/healthcheck.sh
sudo SERVICE=majal SINCE=30m bash /opt/majalops/infrastructure/scripts/logs.sh
```

Complete every applicable post-deployment check. Do not delete the safety backup or snapshot until acceptance.

## Backup security

- Backups contain sensitive operational data and secrets stored in database records. Encrypt in transit and at rest.
- Restrict server backup directories to root and the backup service.
- Use a storage credential that can append backups but cannot alter older immutable copies where supported.
- Store recovery credentials and encryption keys in 1Password Business or Bitwarden, with an offline recovery copy.
- Rotate storage credentials annually and immediately after suspected exposure; test read access after rotation.
- Never log database passwords or commit manifests that contain interpolated Compose configuration.
