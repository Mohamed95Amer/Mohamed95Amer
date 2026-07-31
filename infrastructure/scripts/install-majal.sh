#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
CADDYFILE="${CADDYFILE:-/opt/majalops/infrastructure/caddy/Caddyfile}"
HEALTH_URL="${HEALTH_URL:-https://platform.majalops.com/healthz}"
CONFIRM_INSTALL="${CONFIRM_INSTALL:-NO}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/install-majal.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

on_exit() {
    local exit_code=$?
    trap - EXIT
    if (( exit_code != 0 )); then
        printf 'ERROR: initial deployment failed (exit %s). Persistent volumes were not deleted.\n' \
            "$exit_code" >&2
    fi
    exit "$exit_code"
}
trap on_exit EXIT

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$CONFIRM_INSTALL" == "YES" ]] || die "Set CONFIRM_INSTALL=YES only after the pre-deployment checklist is approved."
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"
[[ -f "$CADDYFILE" ]] || die "CADDYFILE not found: $CADDYFILE"
[[ "$(stat -c '%a' "$ENV_FILE")" =~ ^(600|400)$ ]] || die "ENV_FILE must have mode 0600 or 0400."
[[ "$(stat -c '%U' "$ENV_FILE")" == "root" ]] || die "ENV_FILE must be owned by root."
command -v docker >/dev/null || die "docker is not installed."
docker compose version >/dev/null || die "Docker Compose plugin is not installed."

if grep -Eq 'GENERATE_|REPLACE_|example\.invalid|CHANGE_ME' "$ENV_FILE"; then
    die "ENV_FILE still contains placeholders."
fi

for image_key in CADDY_IMAGE POSTGRES_IMAGE MAJAL_IMAGE BACKUP_HELPER_IMAGE; do
    image="$(env_value "$image_key")"
    [[ "$image" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "$image_key must use an immutable sha256 digest."
done

domain="$(env_value MAJAL_DOMAIN)"
tls_email="$(env_value TLS_EMAIL)"
[[ "$domain" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]] || die "MAJAL_DOMAIN is invalid."
[[ "$tls_email" == *@*.* ]] || die "TLS_EMAIL is invalid."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Rollback before installation: take a Hetzner snapshot and export current DNS records.\n'
printf 'If startup fails, use docker compose down WITHOUT --volumes; persistent data must be preserved.\n'

compose config --quiet
compose pull

caddy_image="$(env_value CADDY_IMAGE)"
docker run --rm \
    -e "MAJAL_DOMAIN=${domain}" -e "TLS_EMAIL=${tls_email}" \
    -e CADDY_LOG_PATH=/tmp/majalops-caddy-validation.log \
    -v "${CADDYFILE}:/etc/caddy/Caddyfile:ro" \
    "$caddy_image" caddy validate --config /etc/caddy/Caddyfile

compose up -d --wait --wait-timeout 900
HEALTH_URL="$HEALTH_URL" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$(dirname "$0")/healthcheck.sh"

printf 'Initial Majal platform deployment completed. Finish every post-deployment check before acceptance.\n'
