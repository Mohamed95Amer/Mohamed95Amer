#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

BACKUP_PROVIDER="${BACKUP_PROVIDER:-}"
RESTIC_PASSWORD="${RESTIC_PASSWORD:-}"
RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/etc/majalops/restic.env}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/configure-backups.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ "$BACKUP_PROVIDER" == "backblaze-b2" || "$BACKUP_PROVIDER" == "cloudflare-r2" ]] || \
    die "BACKUP_PROVIDER must be backblaze-b2 or cloudflare-r2."

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y restic
command -v restic >/dev/null || die "restic installation failed."

if [[ -z "$RESTIC_PASSWORD" ]]; then
    RESTIC_PASSWORD="$(openssl rand -base64 48 | tr -d '\r\n')"
fi

install -d -m 0700 "$(dirname "$RESTIC_ENV_FILE")"
install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE" && chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

tmp="${RESTIC_ENV_FILE}.tmp.$$"
if [[ "$BACKUP_PROVIDER" == "backblaze-b2" ]]; then
    [[ -n "${B2_ACCOUNT_ID:-}" && -n "${B2_ACCOUNT_KEY:-}" && -n "${B2_BUCKET:-}" ]] || \
        die "Backblaze requires B2_ACCOUNT_ID, B2_ACCOUNT_KEY and B2_BUCKET."
    prefix="${B2_PREFIX:-majalops-platform}"
    cat > "$tmp" <<EOF
RESTIC_REPOSITORY=b2:${B2_BUCKET}:${prefix}
RESTIC_PASSWORD=${RESTIC_PASSWORD}
B2_ACCOUNT_ID=${B2_ACCOUNT_ID}
B2_ACCOUNT_KEY=${B2_ACCOUNT_KEY}
BACKUP_PROVIDER=backblaze-b2
EOF
else
    [[ -n "${R2_ACCOUNT_ID:-}" && -n "${R2_ACCESS_KEY_ID:-}" && -n "${R2_SECRET_ACCESS_KEY:-}" && -n "${R2_BUCKET:-}" ]] || \
        die "R2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET."
    prefix="${R2_PREFIX:-majalops-platform}"
    jurisdiction="${R2_JURISDICTION:-default}"
    if [[ "$jurisdiction" == "eu" ]]; then
        endpoint="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
    else
        endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    fi
    cat > "$tmp" <<EOF
RESTIC_REPOSITORY=s3:${endpoint}/${R2_BUCKET}/${prefix}
RESTIC_PASSWORD=${RESTIC_PASSWORD}
AWS_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
AWS_DEFAULT_REGION=auto
BACKUP_PROVIDER=cloudflare-r2
EOF
fi
chmod 0600 "$tmp" && chown root:root "$tmp" && mv "$tmp" "$RESTIC_ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$RESTIC_ENV_FILE"
set +a
if ! restic cat config >/dev/null 2>&1; then
    printf 'Initializing encrypted restic repository for %s...\n' "$BACKUP_PROVIDER"
    restic init
fi
restic snapshots --compact
printf 'Backup provider configured. Store RESTIC_PASSWORD from %s in the company vault.\n' "$RESTIC_ENV_FILE"
