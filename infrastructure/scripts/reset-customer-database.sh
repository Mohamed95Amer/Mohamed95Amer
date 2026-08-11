#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
APP_SERVICE="${APP_SERVICE:-majal}"
DB_SERVICE="${DB_SERVICE:-db}"
CONFIRM_RESET="${CONFIRM_RESET:-NO}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/customer-reset.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
db_exec() {
    local container
    container="$(compose ps -q "$DB_SERVICE")"
    [[ -n "$container" ]] || die "Cannot find the database container."
    # Keep stdin attached: validation and atomic database swaps intentionally
    # feed SQL to psql through heredocs.
    docker exec -i -e PGPASSWORD="$db_password" "$container" "$@"
}
env_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^\047|\047$/, ""); print; exit }' "$ENV_FILE"
}

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ "$CONFIRM_RESET" == "RESET-CUSTOMER-TEMPLATE" ]] || \
    die "Set CONFIRM_RESET=RESET-CUSTOMER-TEMPLATE only after reviewing the automatic backup and rollback path."
[[ -f "$COMPOSE_FILE" && -f "$ENV_FILE" ]] || die "Platform Compose or environment file is missing."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

current_db="$(env_value POSTGRES_DB)"
db_user="$(env_value POSTGRES_USER)"
db_password="$(env_value POSTGRES_PASSWORD)"
[[ "$current_db" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "Unsafe current database name."
[[ -n "$db_user" && -n "$db_password" ]] || die "Database credentials are missing."

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
candidate="majal_clean_${timestamp}"
archive="majal_retired_${timestamp}"

printf 'Creating a transactionally aligned backup before the clean cutover.\n'
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" "$(dirname "$0")/backup.sh"

module_sql="$(cat <<'SQL'
SELECT string_agg(name, ',' ORDER BY name)
FROM ir_module_module
WHERE state = 'installed'
  AND name <> 'majal_demo';
SQL
)"
modules="$(db_exec psql -U "$db_user" -d "$current_db" -Atc "$module_sql")"
[[ "$modules" =~ ^[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)*$ ]] || die "Could not derive the installed module set."

db_exec createdb -U "$db_user" -O "$db_user" "$candidate"

cleanup_candidate() {
    db_exec dropdb --if-exists -U "$db_user" "$candidate" >/dev/null 2>&1 || true
}
trap cleanup_candidate ERR

compose run --rm -e POSTGRES_DB="$candidate" -e MAJAL_MODULES="$modules" \
    "$APP_SERVICE" odoo -d "$candidate" --stop-after-init

validation="$(db_exec psql -U "$db_user" -d "$candidate" -At <<'SQL'
SELECT concat_ws(',',
    (SELECT count(*) FROM project_project),
    (SELECT count(*) FROM project_task),
    (SELECT count(*) FROM maintenance_request),
    (SELECT count(*) FROM ir_module_module WHERE name = 'majal_demo' AND state = 'installed')
);
SQL
)"
if [[ "$validation" != "0,0,0,0" ]]; then
    cleanup_candidate
    die "Candidate database contains unexpected business/demo records: $validation"
fi

printf 'Candidate is clean. Stopping the application for an atomic database/filestore swap.\n'
compose stop -t 90 "$APP_SERVICE"

swap_db() {
    local from="$1" to="$2"
    db_exec psql -U "$db_user" -d postgres -v from_db="$from" -v to_db="$to" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'from_db' AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I RENAME TO %I', :'from_db', :'to_db') \gexec
SQL
}
move_filestore() {
    local from="$1" to="$2"
    compose run --rm --no-deps --entrypoint /bin/sh "$APP_SERVICE" -c \
        "set -eu; root=/var/lib/odoo/filestore; mkdir -p \"\$root\"; if [ -d \"\$root/$from\" ]; then mv \"\$root/$from\" \"\$root/$to\"; fi"
}

db_current_archived=0
db_candidate_active=0
fs_current_archived=0
fs_candidate_active=0

rollback_swap() {
    local code="${1:-1}"
    trap - ERR
    set +e
    printf 'Clean cutover failed; restoring the previous active database.\n' >&2
    compose stop -t 30 "$APP_SERVICE"
    if (( db_candidate_active == 1 )); then
        swap_db "$current_db" "$candidate"
    fi
    if (( db_current_archived == 1 )); then
        swap_db "$archive" "$current_db"
    fi
    if (( fs_candidate_active == 1 )); then
        move_filestore "$current_db" "$candidate"
    fi
    if (( fs_current_archived == 1 )); then
        move_filestore "$archive" "$current_db"
    fi
    compose up -d --wait --wait-timeout 900 "$APP_SERVICE"
    exit "$code"
}
trap 'rollback_swap $?' ERR

swap_db "$current_db" "$archive"
db_current_archived=1
swap_db "$candidate" "$current_db"
db_candidate_active=1
move_filestore "$current_db" "$archive"
fs_current_archived=1
move_filestore "$candidate" "$current_db"
fs_candidate_active=1

compose up -d --wait --wait-timeout 900 "$APP_SERVICE"
compose restart caddy
COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" "$(dirname "$0")/healthcheck.sh"
trap - ERR

printf 'Customer-ready database is active: %s\n' "$current_db"
printf 'Verified zero projects, tasks, maintenance requests and Majal demo installation.\n'
printf 'The previous database is offline as %s and remains recoverable with the pre-cutover backup.\n' "$archive"
printf 'Do not purge the archive until customer acceptance is complete.\n'
