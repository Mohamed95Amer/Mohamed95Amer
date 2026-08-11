#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

MAJAL_DOMAIN="${MAJAL_DOMAIN:-platform.majalops.com}"
TLS_EMAIL="${TLS_EMAIL:-}"
MAJAL_IMAGE="${MAJAL_IMAGE:-}"
SSH_PORT="${SSH_PORT:-22}"
ADMIN_USER="${ADMIN_USER:-majaladmin}"
ENABLE_MONITORING="${ENABLE_MONITORING:-YES}"
BACKUP_PROVIDER="${BACKUP_PROVIDER:-none}"
CONFIRM_PROVISION="${CONFIRM_PROVISION:-NO}"
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/provision-platform.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$CONFIRM_PROVISION" == "YES" ]] || die "Set CONFIRM_PROVISION=YES after creating a Hetzner snapshot."
[[ "$MAJAL_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "MAJAL_IMAGE must be a GHCR image pinned by sha256 digest."
[[ "$TLS_EMAIL" == *@*.* ]] || die "TLS_EMAIL is required."
id "$ADMIN_USER" >/dev/null 2>&1 || die "Administrator $ADMIN_USER does not exist. Run bootstrap-server.sh first."

# Do not exit awk early here. With pipefail enabled, an early consumer exit can
# make sshd receive SIGPIPE and turn a successful hardening check into exit 141.
password_auth="$(sshd -T | awk '$1 == "passwordauthentication" {value=$2} END {print value}')"
root_login="$(sshd -T | awk '$1 == "permitrootlogin" {value=$2} END {print value}')"
[[ "$password_auth" == "no" ]] || die "SSH password authentication is not disabled. Complete SSH hardening first."
[[ "$root_login" == "no" ]] || die "SSH root login is not disabled. Complete SSH hardening first."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Rollback before provisioning: retain the Hetzner snapshot and current SSH session.\n'

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    bash "${SOURCE_ROOT}/scripts/install-docker.sh"
fi

install -d -m 0755 "$INSTALL_ROOT"
cp -a "${SOURCE_ROOT}/." "${INSTALL_ROOT}/"
find "${INSTALL_ROOT}/scripts" -maxdepth 1 -type f -exec chmod 0750 {} +
install -m 0644 "${SOURCE_ROOT}/docker/compose.platform.example.yml" \
    "${INSTALL_ROOT}/docker/compose.platform.yml"
install -m 0644 "${SOURCE_ROOT}/caddy/Caddyfile.example" "${INSTALL_ROOT}/caddy/Caddyfile"

MAJAL_DOMAIN="$MAJAL_DOMAIN" TLS_EMAIL="$TLS_EMAIL" MAJAL_IMAGE="$MAJAL_IMAGE" \
    ENV_FILE="$ENV_FILE" bash "${INSTALL_ROOT}/scripts/generate-environment.sh"

SSH_PORT="$SSH_PORT" APPLY_FIREWALL=YES bash "${INSTALL_ROOT}/scripts/configure-firewall.sh"
bash "${INSTALL_ROOT}/scripts/install-systemd.sh"

if [[ "$BACKUP_PROVIDER" != "none" ]]; then
    ENV_FILE="$ENV_FILE" BACKUP_PROVIDER="$BACKUP_PROVIDER" \
        bash "${INSTALL_ROOT}/scripts/configure-backups.sh"
fi

CONFIRM_INSTALL=YES ENV_FILE="$ENV_FILE" \
    COMPOSE_FILE="${INSTALL_ROOT}/docker/compose.platform.yml" \
    CADDYFILE="${INSTALL_ROOT}/caddy/Caddyfile" \
    bash "${INSTALL_ROOT}/scripts/install-majal.sh"

if [[ "$ENABLE_MONITORING" == "YES" ]]; then
    ENV_FILE="$ENV_FILE" bash "${INSTALL_ROOT}/scripts/configure-monitoring.sh"
fi

systemctl enable --now majalops-platform.service
systemctl enable majalops-demo-reconcile.service
systemctl enable --now majalops-health.timer
if [[ -f /etc/majalops/restic.env ]]; then
    systemctl enable --now majalops-backup.timer majalops-restic-check.timer
fi

printf 'MajalOps platform provisioned. Complete the post-deployment validation checklist.\n'
