#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
# Derived from the host's own env file, not hardcoded to production.
# Every deployment writes MAJAL_DOMAIN into /etc/majalops/platform.env, so
# staging gates on staging and the platform gates on the platform. It used
# to default to platform.majalops.com regardless, and majalops-deploy never
# overrode it: a staging deploy asked production whether it was healthy, so
# a broken staging release passed and a production incident failed an
# unrelated staging deploy. The literal remains only as a last resort for a
# host whose env file predates MAJAL_DOMAIN.
HEALTH_URL="${HEALTH_URL:-}"
DB_SERVICE="${DB_SERVICE:-db}"
HTTP_TIMEOUT_SECONDS="${HTTP_TIMEOUT_SECONDS:-15}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
MEMORY_WARN_PERCENT="${MEMORY_WARN_PERCENT:-85}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/healthcheck.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    [[ -f "$ENV_FILE" ]] || return 0
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"

if [[ -z "$HEALTH_URL" ]]; then
    majal_domain="$(env_value MAJAL_DOMAIN)"
    HEALTH_URL="https://${majal_domain:-platform.majalops.com}/healthz"
fi
[[ "$HTTP_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || die "HTTP_TIMEOUT_SECONDS must be an integer."
command -v curl >/dev/null || die "curl is not installed."
command -v docker >/dev/null || die "docker is not installed."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

failures=0
printf 'MajalOps health check at %s\n' "$(date --iso-8601=seconds)"

mapfile -t expected_services < <(compose config --services)
mapfile -t running_services < <(compose ps --status running --services)
for service in "${expected_services[@]}"; do
    if printf '%s\n' "${running_services[@]}" | grep -Fxq "$service"; then
        printf 'PASS container: %s\n' "$service"
    else
        printf 'FAIL container: %s is not running\n' "$service" >&2
        failures=$((failures + 1))
    fi
done

# The variables below intentionally expand inside the database container.
# shellcheck disable=SC2016
if compose exec -T "$DB_SERVICE" sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null; then
    printf 'PASS PostgreSQL readiness\n'
else
    printf 'FAIL PostgreSQL readiness\n' >&2
    failures=$((failures + 1))
fi

http_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --max-time "$HTTP_TIMEOUT_SECONDS" --proto '=https' --tlsv1.2 "$HEALTH_URL" || true)"
if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    printf 'PASS HTTPS health endpoint: %s (%s)\n' "$HEALTH_URL" "$http_code"
else
    printf 'FAIL HTTPS health endpoint: %s (HTTP %s)\n' "$HEALTH_URL" "${http_code:-none}" >&2
    failures=$((failures + 1))
fi

disk_used="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
memory_used="$(free | awk '/^Mem:/ {printf "%.0f", ($3/$2)*100}')"
load="$(awk '{print $1, $2, $3}' /proc/loadavg)"
cpus="$(nproc)"
printf 'INFO disk=%s%% memory=%s%% load=%s cpus=%s\n' "$disk_used" "$memory_used" "$load" "$cpus"
(( disk_used < DISK_WARN_PERCENT )) || { printf 'WARN disk usage exceeds %s%%\n' "$DISK_WARN_PERCENT"; failures=$((failures + 1)); }
(( memory_used < MEMORY_WARN_PERCENT )) || { printf 'WARN memory usage exceeds %s%%\n' "$MEMORY_WARN_PERCENT"; failures=$((failures + 1)); }

if (( failures > 0 )); then
    die "$failures health check(s) failed."
fi
printf 'PASS all health checks\n'
