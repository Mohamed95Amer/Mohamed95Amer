#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

DEPLOY_USER="${DEPLOY_USER:-majaldeploy}"
DEPLOY_PUBLIC_KEY_FILE="${DEPLOY_PUBLIC_KEY_FILE:-}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "Invalid DEPLOY_USER."
[[ -n "$DEPLOY_PUBLIC_KEY_FILE" && -s "$DEPLOY_PUBLIC_KEY_FILE" ]] || die "DEPLOY_PUBLIC_KEY_FILE is required."
grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( .*)?$' "$DEPLOY_PUBLIC_KEY_FILE" || die "Only an Ed25519 public key is accepted."

getent group ssh-admins >/dev/null || groupadd --system ssh-admins
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
    useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
passwd -l "$DEPLOY_USER" >/dev/null 2>&1 || true
usermod -aG ssh-admins "$DEPLOY_USER"

install -m 0755 "${INSTALL_ROOT}/scripts/majalops-deploy" /usr/local/sbin/majalops-deploy
install -m 0755 "${INSTALL_ROOT}/scripts/majalops-ssh-command" /usr/local/sbin/majalops-ssh-command
cat > /etc/sudoers.d/90-majalops-deploy <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /usr/local/sbin/majalops-deploy
EOF
chmod 0440 /etc/sudoers.d/90-majalops-deploy
visudo -cf /etc/sudoers.d/90-majalops-deploy

home_dir="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "${home_dir}/.ssh"
public_key="$(tr -d '\r\n' < "$DEPLOY_PUBLIC_KEY_FILE")"
printf 'restrict,command="/usr/local/sbin/majalops-ssh-command" %s\n' "$public_key" \
    > "${home_dir}/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "${home_dir}/.ssh/authorized_keys"
chmod 0600 "${home_dir}/.ssh/authorized_keys"
printf 'Restricted deployment identity configured: %s\n' "$DEPLOY_USER"
