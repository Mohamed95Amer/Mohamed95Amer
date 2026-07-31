#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
APP_SERVICE="${APP_SERVICE:-majal}"
PREVIOUS_IMAGE="${PREVIOUS_IMAGE:-}"
CONFIRM_ROLLBACK="${CONFIRM_ROLLBACK:-NO}"
HEALTH_URL="${HEALTH_URL:-https://majalops.com/web/health}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/rollback.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
set_env_value() {
    local key="$1" value="$2" source="$3" target="$4"
    awk -v key="$key" -v value="$value" '
        BEGIN { found=0 }
        index($0, key "=") == 1 { print key "=" value; found=1; next }
        { print }
        END { if (!found) print key "=" value }
    ' "$source" > "$target"
}

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$CONFIRM_ROLLBACK" == "YES" ]] || die "Set CONFIRM_ROLLBACK=YES after reviewing the deployment runbook."
[[ -n "$PREVIOUS_IMAGE" && "$PREVIOUS_IMAGE" == *@sha256:* ]] || \
    die "PREVIOUS_IMAGE must be an immutable image digest such as registry/image@sha256:..."
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
env_backup="${ENV_FILE}.before-rollback.${timestamp}"
env_tmp="${ENV_FILE}.tmp.$$"
cp -a "$ENV_FILE" "$env_backup"
printf 'Rollback safety file: %s (restore it and run docker compose up if rollback fails).\n' "$env_backup"

set_env_value MAJAL_IMAGE "$PREVIOUS_IMAGE" "$ENV_FILE" "$env_tmp"
chmod --reference="$ENV_FILE" "$env_tmp"
chown --reference="$ENV_FILE" "$env_tmp"
mv "$env_tmp" "$ENV_FILE"

if ! compose pull "$APP_SERVICE" || \
    ! compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE"; then
    cp -a "$env_backup" "$ENV_FILE"
    compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE" || true
    die "Rollback deployment failed; original environment restored."
fi

if ! HEALTH_URL="$HEALTH_URL" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$(dirname "$0")/healthcheck.sh"; then
    printf 'Rollback image started but health checks failed. Investigate; env backup is %s.\n' "$env_backup" >&2
    exit 1
fi

printf 'Rollback complete: %s\n' "$PREVIOUS_IMAGE"
