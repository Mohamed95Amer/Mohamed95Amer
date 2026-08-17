#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
BACKUP_SET="${BACKUP_SET:-}"
DB_SERVICE="${DB_SERVICE:-db}"
APP_SERVICE="${APP_SERVICE:-majal}"
FILESTORE_PATH="${FILESTORE_PATH:-/var/lib/odoo}"
BACKUP_HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-NO}"
CREATE_SAFETY_BACKUP="${CREATE_SAFETY_BACKUP:-YES}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/restore.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

restart_app=0
cleanup() {
    local code=$?
    if (( restart_app == 1 )); then
        compose up -d "$APP_SERVICE" >/dev/null 2>&1 || true
    fi
    if (( code != 0 )); then
        printf 'ERROR: restore failed (exit %s). Use the safety backup named above to recover.\n' "$code" >&2
    fi
    exit "$code"
}
trap cleanup EXIT

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$CONFIRM_RESTORE" == "YES" ]] || die "Restore is destructive. Set CONFIRM_RESTORE=YES after reading the restore runbook."
[[ -n "$BACKUP_SET" && -d "$BACKUP_SET" ]] || die "BACKUP_SET must name an existing backup directory."
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"
if [[ -z "$BACKUP_HELPER_IMAGE" ]]; then
    BACKUP_HELPER_IMAGE="$(env_value BACKUP_HELPER_IMAGE)"
fi
[[ "$BACKUP_HELPER_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "BACKUP_HELPER_IMAGE must use an immutable sha256 digest."
for required in database.dump filestore.tar.gz SHA256SUMS; do
    [[ -f "${BACKUP_SET}/${required}" ]] || die "Backup is missing ${required}."
done
command -v docker >/dev/null || die "docker is not installed."
command -v sha256sum >/dev/null || die "sha256sum is required."

db_name="$(env_value POSTGRES_DB)"
db_user="$(env_value POSTGRES_USER)"
[[ "$db_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "POSTGRES_DB must be an unquoted PostgreSQL identifier."
[[ "$db_user" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "POSTGRES_USER must be an unquoted PostgreSQL identifier."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Rollback before restore: a safety backup will be created unless CREATE_SAFETY_BACKUP=NO.\n'
(
    cd "$BACKUP_SET"
    sha256sum --check SHA256SUMS
)

if [[ "$CREATE_SAFETY_BACKUP" == "YES" ]]; then
    printf 'Creating mandatory pre-restore safety backup...\n'
    COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" DB_SERVICE="$DB_SERVICE" \
        APP_SERVICE="$APP_SERVICE" FILESTORE_PATH="$FILESTORE_PATH" \
        BACKUP_RETENTION_DAYS=0 \
        "$(dirname "$0")/backup.sh"
else
    printf 'WARNING: safety backup explicitly disabled. Existing state may be unrecoverable.\n'
fi

docker image inspect "$BACKUP_HELPER_IMAGE" >/dev/null 2>&1 || docker pull "$BACKUP_HELPER_IMAGE"
app_container="$(compose ps -a -q "$APP_SERVICE")"
[[ -n "$app_container" ]] || die "Application container does not exist; create it before restore."

compose stop "$APP_SERVICE"
restart_app=1
compose up -d "$DB_SERVICE"
compose exec -T "$DB_SERVICE" pg_isready -U "$db_user" -d postgres

compose exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U "$db_user" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db_name}' AND pid <> pg_backend_pid();"
compose exec -T "$DB_SERVICE" dropdb --if-exists -U "$db_user" "$db_name"
compose exec -T "$DB_SERVICE" createdb -U "$db_user" -O "$db_user" "$db_name"
compose exec -T "$DB_SERVICE" pg_restore --exit-on-error --no-owner --no-acl \
    -U "$db_user" -d "$db_name" < "${BACKUP_SET}/database.dump"

filestore_parent="$(dirname "$FILESTORE_PATH")"
docker run --rm --volumes-from "$app_container" -v "${BACKUP_SET}:/backup:ro" \
    "$BACKUP_HELPER_IMAGE" sh -ec \
    'find "$1" -mindepth 1 -delete; tar -xzf /backup/filestore.tar.gz -C "$2"' \
    sh "$FILESTORE_PATH" "$filestore_parent"

compose up -d --wait --wait-timeout 900 "$APP_SERVICE"
restart_app=0
printf 'Restore completed. Run healthcheck.sh, inspect logs, and complete the post-deployment checklist.\n'
