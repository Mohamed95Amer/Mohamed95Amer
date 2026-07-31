#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
APP_SERVICE="${APP_SERVICE:-majal}"
TARGET_IMAGE="${TARGET_IMAGE:-}"
HEALTH_URL="${HEALTH_URL:-https://platform.majalops.com/healthz}"
CONFIRM_UPDATE="${CONFIRM_UPDATE:-NO}"
CREATE_BACKUP="${CREATE_BACKUP:-YES}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/update-majal.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}
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
[[ "$CONFIRM_UPDATE" == "YES" ]] || die "Set CONFIRM_UPDATE=YES only after release and rollback review."
[[ "$TARGET_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "TARGET_IMAGE must use an immutable sha256 digest."
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"
command -v docker >/dev/null || die "docker is not installed."

current_image="$(env_value MAJAL_IMAGE)"
[[ "$current_image" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "Current MAJAL_IMAGE is not an immutable digest."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

if [[ "$current_image" == "$TARGET_IMAGE" ]]; then
    printf 'No update needed; MAJAL_IMAGE already matches the target digest.\n'
    exit 0
fi

printf 'Rollback before update: take a Hetzner snapshot and retain %s.\n' "$current_image"
printf 'This script performs no database migration. Stop if the release is not backward-compatible with the current schema.\n'

if [[ "$CREATE_BACKUP" == "YES" ]]; then
    COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
        "$(dirname "$0")/backup.sh"
else
    die "CREATE_BACKUP=NO is not permitted by the standard update path. Use an incident-approved manual procedure."
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
env_backup="${ENV_FILE}.before-update.${timestamp}"
env_tmp="${ENV_FILE}.tmp.$$"
cp -a "$ENV_FILE" "$env_backup"
set_env_value MAJAL_IMAGE "$TARGET_IMAGE" "$ENV_FILE" "$env_tmp"
chmod --reference="$ENV_FILE" "$env_tmp"
chown --reference="$ENV_FILE" "$env_tmp"
mv "$env_tmp" "$ENV_FILE"

rollback_on_failure() {
    local message="$1"
    printf 'ERROR: %s Restoring previous image reference.\n' "$message" >&2
    cp -a "$env_backup" "$ENV_FILE"
    compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE" || true
    printf 'Previous image requested: %s\n' "$current_image" >&2
    exit 1
}

compose config --quiet || rollback_on_failure "Compose validation failed."
compose pull "$APP_SERVICE" || rollback_on_failure "Image pull failed."
compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE" || \
    rollback_on_failure "Application recreation or readiness failed."

if ! HEALTH_URL="$HEALTH_URL" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$(dirname "$0")/healthcheck.sh"; then
    rollback_on_failure "Health checks failed."
fi

printf 'Majal update completed: %s\n' "$TARGET_IMAGE"
printf 'Previous environment retained at %s until post-deployment acceptance.\n' "$env_backup"
