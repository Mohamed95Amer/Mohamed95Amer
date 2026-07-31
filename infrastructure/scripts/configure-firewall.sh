#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

SSH_PORT="${SSH_PORT:-22}"
APPLY_FIREWALL="${APPLY_FIREWALL:-NO}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/configure-firewall.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
on_error() {
    local exit_code=$?
    printf 'ERROR: firewall configuration failed at line %s (exit %s).\n' \
        "${BASH_LINENO[0]:-unknown}" "$exit_code" >&2
    exit "$exit_code"
}
trap on_error ERR

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    die "SSH_PORT must be 1-65535."
fi
command -v ufw >/dev/null || die "ufw is not installed. Run bootstrap-server.sh first."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Planned inbound rules: SSH %s/tcp (rate limited), HTTP 80/tcp, HTTPS 443/tcp.\n' "$SSH_PORT"
printf 'Rollback before enabling: keep the current SSH session open; recovery command is: ufw disable\n'

if [[ "$APPLY_FIREWALL" != "YES" ]]; then
    ufw status verbose || true
    printf 'Dry run only. Verify SSH_PORT, then rerun with APPLY_FIREWALL=YES.\n'
    exit 0
fi

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw limit "${SSH_PORT}/tcp" comment 'SSH'
ufw allow 80/tcp comment 'HTTP for Caddy ACME redirect/challenge'
ufw allow 443/tcp comment 'HTTPS'
ufw logging medium
ufw --force enable
ufw status verbose

printf 'Firewall enabled. Test a second SSH session now; do not close the current session first.\n'
