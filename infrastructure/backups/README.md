# Backup boundary and retention

Real backups never live in Git or this folder. Local paired PostgreSQL/filestore sets live under `/srv/majalops/backups`; `backup-offsite.sh` uploads each completed set into an encrypted restic repository in either Backblaze B2 or Cloudflare R2.

Automated retention is 7 daily, 4 weekly, and 3 monthly snapshots. A weekly `restic check` verifies repository integrity. Prometheus alerts when the newest successful off-site backup is older than 26 hours. Hetzner's provider backup is an additional recovery layer, not a substitute for the application-consistent pair.

`configure-backups.sh` is idempotent and accepts either:

- `BACKUP_PROVIDER=backblaze-b2` with `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`, and `B2_BUCKET`; or
- `BACKUP_PROVIDER=cloudflare-r2` with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`.

It generates the restic encryption password when absent, stores all runtime values in root-owned `/etc/majalops/restic.env`, initializes the repository if necessary, and never prints the secret. Store that encryption password separately in 1Password or Bitwarden; losing it makes the remote backup unrecoverable.

Every backup remains operationally unproven until `restore.sh` succeeds against a disposable server and the application opens with matching attachments.
