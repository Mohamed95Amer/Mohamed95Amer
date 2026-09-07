#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
METRIC_DIR="${METRIC_DIR:-/var/lib/majalops/node-exporter}"
STATE_FILE="${STATE_FILE:-/var/lib/majalops/recovery.state}"
LOCK_FILE="${LOCK_FILE:-/run/lock/majalops-auto-recover.lock}"
MAX_RECOVERIES="${MAX_RECOVERIES:-3}"
WINDOW_SECONDS="${WINDOW_SECONDS:-1800}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() {
    local compose_runner="${INSTALL_ROOT}/scripts/platform-compose.sh"
    ENV_FILE="$ENV_FILE" INSTALL_ROOT="$INSTALL_ROOT" "$compose_runner" "$@"
}
write_metric() {
    local health="$1" total="$2" tmp
    install -d -m 0755 "$METRIC_DIR"
    tmp="${METRIC_DIR}/majalops.prom.tmp.$$"
    cat > "$tmp" <<EOF
# HELP majalops_health_status Result of the complete MajalOps health check (1 healthy, 0 unhealthy).
# TYPE majalops_health_status gauge
majalops_health_status ${health}
# HELP majalops_automatic_recovery_total Number of automatic recovery attempts.
# TYPE majalops_automatic_recovery_total counter
majalops_automatic_recovery_total ${total}
EOF
    chmod 0644 "$tmp"
    mv "$tmp" "${METRIC_DIR}/majalops.prom"
}

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ -f "$ENV_FILE" ]] || die "Platform environment is missing."
command -v flock >/dev/null || die "flock is required."
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

now="$(date +%s)"
window_start="$now"
window_count=0
total=0
if [[ -f "$STATE_FILE" ]]; then
    # The state file is root-owned and contains only numeric assignments written below.
    # shellcheck disable=SC1090
    source "$STATE_FILE"
fi
[[ "$window_start" =~ ^[0-9]+$ && "$window_count" =~ ^[0-9]+$ && "$total" =~ ^[0-9]+$ ]] || \
    die "Invalid recovery state."
if (( now - window_start > WINDOW_SECONDS )); then
    window_start="$now"
    window_count=0
fi

if ENV_FILE="$ENV_FILE" "${INSTALL_ROOT}/scripts/healthcheck.sh"; then
    write_metric 1 "$total"
    exit 0
fi

write_metric 0 "$total"
if (( window_count >= MAX_RECOVERIES )); then
    printf 'Recovery limit reached (%s attempts in %s seconds); alerting without another restart.\n' \
        "$MAX_RECOVERIES" "$WINDOW_SECONDS" >&2
    exit 1
fi

window_count="$((window_count + 1))"
total="$((total + 1))"
cat > "$STATE_FILE" <<EOF
window_start=${window_start}
window_count=${window_count}
total=${total}
EOF
chmod 0600 "$STATE_FILE"

printf 'Health check failed; automatic recovery attempt %s/%s.\n' "$window_count" "$MAX_RECOVERIES"
for service in db majal caddy; do
    container_id="$(compose ps -a -q "$service")"
    if [[ -z "$container_id" ]]; then
        compose up -d "$service"
        continue
    fi
    running="$(docker inspect --format '{{.State.Running}}' "$container_id")"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
    if [[ "$running" != "true" ]]; then
        compose up -d "$service"
    elif [[ "$service" != "db" && "$health" == "unhealthy" ]]; then
        compose restart "$service"
    fi
done

sleep 20
if ENV_FILE="$ENV_FILE" "${INSTALL_ROOT}/scripts/healthcheck.sh"; then
    write_metric 1 "$total"
    printf 'Automatic recovery succeeded.\n'
    exit 0
fi
write_metric 0 "$total"
die "Automatic recovery did not restore health."
