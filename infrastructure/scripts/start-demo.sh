#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
SESSION_FILE="${SESSION_FILE:-/var/lib/majalops/demo/session.env}"
STATUS_FILE="${STATUS_FILE:-/var/lib/majalops/demo/status}"
LOCK_FILE="${LOCK_FILE:-/run/lock/majalops-demo.lock}"
TTL_MINUTES="${TTL_MINUTES:-60}"
DEMO_DOMAIN="${DEMO_DOMAIN:-demo.majalops.com}"
DEMO_LOGIN="${DEMO_LOGIN:-demo.owner@majal.local}"
REPLACE_ACTIVE="${REPLACE_ACTIVE:-NO}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/demo-lifecycle.log}"
DEMO_HEALTH_URL="${DEMO_HEALTH_URL:-https://${DEMO_DOMAIN}/healthz}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
env_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^\047|\047$/, ""); print; exit }' "$ENV_FILE"
}
compose_demo() {
    docker compose --env-file "$ENV_FILE" --env-file "$SESSION_FILE" \
        -f "$COMPOSE_FILE" --profile demo "$@"
}

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ "$TTL_MINUTES" =~ ^[0-9]+$ ]] && (( TTL_MINUTES >= 15 && TTL_MINUTES <= 240 )) || \
    die "TTL_MINUTES must be between 15 and 240."
[[ "$DEMO_DOMAIN" =~ ^[a-z0-9.-]+$ ]] || die "Invalid demo domain."
[[ -f "$COMPOSE_FILE" && -f "$ENV_FILE" ]] || die "Platform Compose or environment file is missing."
command -v docker >/dev/null || die "Docker is required."
command -v systemd-run >/dev/null || die "systemd-run is required for automatic expiry."

install -d -m 0700 "$(dirname "$SESSION_FILE")"
install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec 9>"$LOCK_FILE"
flock -n 9 || die "Another demo lifecycle operation is running."
exec > >(tee -a "$LOG_FILE") 2>&1

if [[ -f "$SESSION_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$SESSION_FILE"
    if docker ps --format '{{.Names}}' | grep -qx 'majalops-platform-demo-1'; then
        [[ "$REPLACE_ACTIVE" == "YES" ]] || die "A demo is already active. Use demo-status.sh or set REPLACE_ACTIVE=YES."
        CONFIRM_DESTROY=YES SKIP_LOCK=YES "${SCRIPT_DIR}/stop-demo.sh"
    else
        printf 'Found an interrupted demo session; removing its exact isolated resources.\n'
        CONFIRM_DESTROY=YES SKIP_LOCK=YES "${SCRIPT_DIR}/stop-demo.sh"
    fi
fi

timestamp="$(date -u +%Y%m%d_%H%M%S)"
suffix="$(openssl rand -hex 3)"
db_name="majal_demo_${timestamp}_${suffix}"
db_role="majal_demo_${suffix}"
db_role_password="$(openssl rand -hex 24)"
password="$(openssl rand -hex 16)"
db_user="$(env_value POSTGRES_USER)"
db_password="$(env_value POSTGRES_PASSWORD)"
[[ -n "$db_user" && -n "$db_password" ]] || die "Database credentials are missing from the platform environment."

module_sql="$(cat <<'SQL'
SELECT string_agg(name, ',' ORDER BY name)
FROM ir_module_module
WHERE state = 'installed'
  AND (
      left(name, 13) = 'construction_'
      OR left(name, 9) = 'facility_'
      OR left(name, 6) = 'majal_'
      OR name IN ('web_responsive', 'om_account_accountant')
  )
  AND name <> 'majal_demo';
SQL
)"
db_container="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q db)"
[[ -n "$db_container" ]] || die "Cannot find the platform database container."
modules="$(docker exec -e PGPASSWORD="$db_password" "$db_container" \
    psql -U "$db_user" -d "$(env_value POSTGRES_DB)" -Atc "$module_sql")"
[[ "$modules" =~ ^[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)*$ ]] || die "Could not derive a safe installed Majal module list."

cat >"$SESSION_FILE" <<EOF
MAJAL_DEMO_DB=${db_name}
MAJAL_DEMO_DB_USER=${db_role}
MAJAL_DEMO_DB_PASSWORD=${db_role_password}
MAJAL_DEMO_MODULES=${modules}
MAJAL_DEMO_LOGIN=${DEMO_LOGIN}
MAJAL_DEMO_PASSWORD=${password}
MAJAL_DEMO_DOMAIN=${DEMO_DOMAIN}
EOF
chmod 0600 "$SESSION_FILE"

cleanup_failed_start() {
    printf 'Demo creation failed; destroying the incomplete isolated session.\n' >&2
    CONFIRM_DESTROY=YES SKIP_LOCK=YES "${SCRIPT_DIR}/stop-demo.sh" || true
    exit 1
}
trap cleanup_failed_start ERR

# The public demo never receives the platform database owner credential. Its
# short-lived role owns only its short-lived database and is dropped at expiry.
docker exec -e PGPASSWORD="$db_password" "$db_container" \
    psql -U "$db_user" -d postgres \
    -v role_name="$db_role" -v role_password="$db_role_password" -v db_name="$db_name" <<'SQL'
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION',
    :'role_name', :'role_password'
) \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'role_name') \gexec
SQL

compose_demo up -d --wait --wait-timeout 1200 demo
curl --fail --silent --show-error --max-time 20 "$DEMO_HEALTH_URL" >/dev/null

# The customer receives the full requested window after the demo is ready,
# rather than losing initialization time from the advertised session.
expires_epoch="$(( $(date +%s) + TTL_MINUTES * 60 ))"
expires_at="$(date -u -d "@${expires_epoch}" +%Y-%m-%dT%H:%M:%SZ)"
cat >>"$SESSION_FILE" <<EOF
MAJAL_DEMO_EXPIRES_EPOCH=${expires_epoch}
MAJAL_DEMO_EXPIRES_AT=${expires_at}
EOF

cat >"$STATUS_FILE" <<EOF
url=https://${DEMO_DOMAIN}/app
login=${DEMO_LOGIN}
expires_at=${expires_at}
database=${db_name}
EOF
chmod 0640 "$STATUS_FILE"

systemctl stop majalops-demo-expiry.timer majalops-demo-expiry.service >/dev/null 2>&1 || true
systemctl reset-failed majalops-demo-expiry.service >/dev/null 2>&1 || true
systemd-run --unit=majalops-demo-expiry --on-active="${TTL_MINUTES}m" \
    --property=Type=oneshot \
    /usr/bin/env CONFIRM_DESTROY=YES "${SCRIPT_DIR}/stop-demo.sh"

trap - ERR
printf '\nMajal one-hour demo is ready.\n'
printf 'URL: https://%s/app\n' "$DEMO_DOMAIN"
printf 'Login: %s\n' "$DEMO_LOGIN"
printf 'Password: %s\n' "$password"
printf 'Expires: %s\n' "$expires_at"
printf 'All records are synthetic; the database and filestore are destroyed automatically.\n'
