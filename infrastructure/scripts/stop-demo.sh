#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
SESSION_FILE="${SESSION_FILE:-/var/lib/majalops/demo/session.env}"
STATUS_FILE="${STATUS_FILE:-/var/lib/majalops/demo/status}"
LOCK_FILE="${LOCK_FILE:-/run/lock/majalops-demo.lock}"
CONFIRM_DESTROY="${CONFIRM_DESTROY:-NO}"
SKIP_LOCK="${SKIP_LOCK:-NO}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
env_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^\047|\047$/, ""); print; exit }' "$ENV_FILE"
}
compose_demo() {
    docker compose --env-file "$ENV_FILE" --env-file "$SESSION_FILE" \
        -f "$COMPOSE_FILE" --profile demo "$@"
}

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ "$CONFIRM_DESTROY" == "YES" ]] || die "Set CONFIRM_DESTROY=YES after verifying this is the synthetic demo session."
[[ -f "$SESSION_FILE" ]] || { printf 'No demo session exists.\n'; exit 0; }

if [[ "$SKIP_LOCK" != "YES" ]]; then
    exec 9>"$LOCK_FILE"
    flock 9
fi
# shellcheck disable=SC1090
source "$SESSION_FILE"
[[ "${MAJAL_DEMO_DB:-}" =~ ^majal_demo_[0-9]{8}_[0-9]{6}_[a-f0-9]{6}$ ]] || \
    die "Refusing to destroy an unexpected database name."
[[ "${MAJAL_DEMO_DB_USER:-}" =~ ^majal_demo_[a-f0-9]{6}$ ]] || \
    die "Refusing to destroy an unexpected database role."

compose_demo stop -t 45 demo || true
compose_demo rm -f demo || true

db_user="$(env_value POSTGRES_USER)"
db_password="$(env_value POSTGRES_PASSWORD)"
db_container="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q db)"
[[ -n "$db_container" ]] || die "Cannot find the platform database container."
docker exec -e PGPASSWORD="$db_password" "$db_container" \
    psql -U "$db_user" -d postgres -v db_name="$MAJAL_DEMO_DB" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'db_name' AND pid <> pg_backend_pid();
SQL
docker exec -e PGPASSWORD="$db_password" "$db_container" \
    dropdb --if-exists -U "$db_user" "$MAJAL_DEMO_DB"
docker exec -e PGPASSWORD="$db_password" "$db_container" \
    psql -U "$db_user" -d postgres -v role_name="$MAJAL_DEMO_DB_USER" <<'SQL'
SELECT format('DROP ROLE IF EXISTS %I', :'role_name') \gexec
SQL

# The volume is dedicated to the ephemeral demo service. Verify its Compose
# labels before removal so no platform/customer volume can match accidentally.
demo_volume="majalops-platform_majal-demo-data"
project_label="$(docker volume inspect -f '{{index .Labels "com.docker.compose.project"}}' "$demo_volume" 2>/dev/null || true)"
volume_label="$(docker volume inspect -f '{{index .Labels "com.docker.compose.volume"}}' "$demo_volume" 2>/dev/null || true)"
if [[ "$project_label" == "majalops-platform" && "$volume_label" == "majal-demo-data" ]]; then
    docker volume rm "$demo_volume" >/dev/null
fi

rm -f "$SESSION_FILE" "$STATUS_FILE"
printf 'Destroyed synthetic demo database %s and its dedicated filestore.\n' "$MAJAL_DEMO_DB"
