#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/etc/majalops/restic.env}"
METRIC_DIR="${METRIC_DIR:-/var/lib/majalops/node-exporter}"
LOCK_FILE="${LOCK_FILE:-/run/lock/majalops-backup.lock}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
env_value() { awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"; }

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
[[ -f "$RESTIC_ENV_FILE" ]] || die "Missing $RESTIC_ENV_FILE"
command -v flock >/dev/null || die "flock is required."
exec 9>"$LOCK_FILE"
flock -n 9 || die "Another backup is running."

set -a
# Both files are root-owned mode 0600 and contain only generated assignments.
# shellcheck disable=SC1090
source "$RESTIC_ENV_FILE"
set +a

backup_root="$(env_value BACKUP_ROOT)"
COMPOSE_FILE="${INSTALL_ROOT}/docker/compose.platform.yml" ENV_FILE="$ENV_FILE" \
    BACKUP_ROOT="$backup_root" bash "${INSTALL_ROOT}/scripts/backup.sh"
latest="$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'majalops-*' ! -name '*.partial' -printf '%T@ %p\n' \
    | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$latest" && -d "$latest" ]] || die "No completed local backup found."

restic backup --tag majalops-platform --host majalops-platform-01 "$latest"
restic forget --tag majalops-platform --keep-daily 7 --keep-weekly 4 --keep-monthly 3 --prune

install -d -m 0755 "$METRIC_DIR"
metric_tmp="${METRIC_DIR}/majalops_backup.prom.tmp.$$"
cat > "$metric_tmp" <<EOF
# HELP majalops_backup_last_success_timestamp_seconds Unix timestamp of the last successful off-site backup.
# TYPE majalops_backup_last_success_timestamp_seconds gauge
majalops_backup_last_success_timestamp_seconds $(date +%s)
EOF
chmod 0644 "$metric_tmp"
mv "$metric_tmp" "${METRIC_DIR}/majalops_backup.prom"
printf 'Local and off-site backup completed successfully.\n'
