#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/srv/majalops/backups}"
DB_SERVICE="${DB_SERVICE:-db}"
APP_SERVICE="${APP_SERVICE:-majal}"
FILESTORE_PATH="${FILESTORE_PATH:-/var/lib/odoo}"
BACKUP_HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/backup.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

app_paused=0
cleanup() {
    local code=$?
    if (( app_paused == 1 )); then
        compose unpause "$APP_SERVICE" >/dev/null 2>&1 || true
    fi
    if (( code != 0 )); then
        printf 'ERROR: backup failed (exit %s). Partial set: %s\n' "$code" "${work_dir:-not-created}" >&2
    fi
    exit "$code"
}
trap cleanup EXIT

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"
if [[ -z "$BACKUP_HELPER_IMAGE" ]]; then
    BACKUP_HELPER_IMAGE="$(env_value BACKUP_HELPER_IMAGE)"
fi
[[ "$BACKUP_HELPER_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "BACKUP_HELPER_IMAGE must use an immutable sha256 digest."
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a non-negative integer."
[[ "$BACKUP_ROOT" == /* && "$BACKUP_ROOT" != "/" ]] || die "BACKUP_ROOT must be a safe absolute path."
command -v docker >/dev/null || die "docker is not installed."
command -v sha256sum >/dev/null || die "sha256sum is required."

install -d -m 0750 "$LOG_DIR" "$BACKUP_ROOT"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="${BACKUP_ROOT}/majalops-${timestamp}.partial"
final_dir="${BACKUP_ROOT}/majalops-${timestamp}"
[[ ! -e "$work_dir" && ! -e "$final_dir" ]] || die "Backup destination already exists."
install -d -m 0700 "$work_dir"

compose ps --status running --services | grep -Fxq "$DB_SERVICE" || die "Database service is not running: $DB_SERVICE"
compose ps --status running --services | grep -Fxq "$APP_SERVICE" || die "Application service is not running: $APP_SERVICE"
app_container="$(compose ps -q "$APP_SERVICE")"
[[ -n "$app_container" ]] || die "Cannot find the application container."

docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null 2>&1 || docker pull "$BACKUP_HELPER_IMAGE"

printf 'Pausing %s for a transactionally aligned database + filestore backup.\n' "$APP_SERVICE"
compose pause "$APP_SERVICE"
app_paused=1

# The variables below intentionally expand inside the database container.
# shellcheck disable=SC2016
compose exec -T "$DB_SERVICE" sh -ec \
    'pg_dump --format=custom --compress=9 --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' \
    > "${work_dir}/database.dump"

filestore_parent="$(dirname "$FILESTORE_PATH")"
filestore_name="$(basename "$FILESTORE_PATH")"
docker run --rm --volumes-from "$app_container" \
    -v "${work_dir}:/backup" "$BACKUP_HELPER_IMAGE" \
    tar --numeric-owner -C "$filestore_parent" -czf /backup/filestore.tar.gz "$filestore_name"

compose unpause "$APP_SERVICE"
app_paused=0

cat > "${work_dir}/metadata.txt" <<EOF
created_utc=${timestamp}
hostname=$(hostname --fqdn 2>/dev/null || hostname)
database_service=${DB_SERVICE}
application_service=${APP_SERVICE}
filestore_path=${FILESTORE_PATH}
compose_project=${COMPOSE_PROJECT_NAME:-majalops}
EOF
compose images > "${work_dir}/images.txt"
(
    cd "$work_dir"
    sha256sum database.dump filestore.tar.gz metadata.txt images.txt > SHA256SUMS
)
mv "$work_dir" "$final_dir"

if (( BACKUP_RETENTION_DAYS > 0 )); then
    while IFS= read -r -d '' expired; do
        [[ "$expired" == "${BACKUP_ROOT}/majalops-"* ]] || die "Refusing unsafe retention target: $expired"
        printf 'Removing expired local backup: %s\n' "$expired"
        rm -rf -- "$expired"
    done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'majalops-*' \
        ! -name '*.partial' -mtime "+${BACKUP_RETENTION_DAYS}" -print0)
fi

printf 'Backup complete: %s\n' "$final_dir"
printf 'Next: copy the encrypted backup off-host and verify it with restore.sh on a disposable environment.\n'
