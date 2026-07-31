#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

SCRIPT_NAME="$(basename "$0")"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/${SCRIPT_NAME%.sh}.log}"
HOSTNAME_FQDN="${HOSTNAME_FQDN:-majalops-platform-01}"
SERVER_TIMEZONE="${SERVER_TIMEZONE:-UTC}"
SERVER_LOCALE="${SERVER_LOCALE:-en_US.UTF-8}"
ADMIN_USER="${ADMIN_USER:-majaladmin}"
ADMIN_AUTHORIZED_KEYS_FILE="${ADMIN_AUTHORIZED_KEYS_FILE:-/root/.ssh/authorized_keys}"
SSH_PORT="${SSH_PORT:-22}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
HARDEN_SSH="${HARDEN_SSH:-0}"
CONFIRM_ADMIN_SSH_TESTED="${CONFIRM_ADMIN_SSH_TESTED:-NO}"

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

on_error() {
    local exit_code=$?
    printf 'ERROR: %s failed at line %s (exit %s). Review %s.\n' \
        "$SCRIPT_NAME" "${BASH_LINENO[0]:-unknown}" "$exit_code" "$LOG_FILE" >&2
    exit "$exit_code"
}
trap on_error ERR

[[ "${EUID}" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$ADMIN_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "ADMIN_USER is invalid."
if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    die "SSH_PORT must be 1-65535."
fi
[[ "$SWAP_SIZE_GB" =~ ^[0-9]+$ ]] || die "SWAP_SIZE_GB must be a non-negative integer."
[[ -r /etc/os-release ]] || die "Cannot identify the operating system."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || \
    die "This script supports Ubuntu 24.04 LTS only; found ${PRETTY_NAME:-unknown}."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf '==> MajalOps bootstrap started at %s\n' "$(date --iso-8601=seconds)"
printf 'Rollback before risky actions: create a Hetzner snapshot and keep the current SSH session open.\n'

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y \
    auditd audispd-plugins ca-certificates chrony curl fail2ban gnupg jq \
    locales logrotate openssl sudo ufw unattended-upgrades

hostnamectl set-hostname "$HOSTNAME_FQDN"
timedatectl set-timezone "$SERVER_TIMEZONE"
locale-gen "$SERVER_LOCALE"
update-locale LANG="$SERVER_LOCALE" LC_ALL="$SERVER_LOCALE"

if ! getent group ssh-admins >/dev/null; then
    groupadd --system ssh-admins
fi

if ! id "$ADMIN_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "MajalOps administrator" "$ADMIN_USER"
fi
usermod -aG sudo,ssh-admins "$ADMIN_USER"
passwd -l "$ADMIN_USER" >/dev/null 2>&1 || true

[[ -s "$ADMIN_AUTHORIZED_KEYS_FILE" ]] || \
    die "No public keys found at $ADMIN_AUTHORIZED_KEYS_FILE. Root SSH has not been changed."
install -d -m 0700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/${ADMIN_USER}/.ssh"
install -m 0600 -o "$ADMIN_USER" -g "$ADMIN_USER" \
    "$ADMIN_AUTHORIZED_KEYS_FILE" "/home/${ADMIN_USER}/.ssh/authorized_keys"

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/52majalops-unattended-upgrades <<'EOF'
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades

cat > /etc/fail2ban/jail.d/majalops-sshd.local <<EOF
[sshd]
enabled = true
port = ${SSH_PORT}
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
fail2ban-client reload

systemctl enable --now chrony
chronyc tracking || true

install -d -m 0755 /etc/docker
install -d -m 0700 /etc/majalops
cat > /etc/audit/rules.d/99-majalops.rules <<'EOF'
-w /etc/ssh/sshd_config -p wa -k sshd_config
-w /etc/ssh/sshd_config.d/ -p wa -k sshd_config
-w /etc/sudoers -p wa -k privilege_changes
-w /etc/sudoers.d/ -p wa -k privilege_changes
-w /etc/docker/ -p wa -k docker_config
-w /etc/majalops/ -p wa -k majalops_config
EOF
systemctl enable --now auditd
augenrules --load

cat > /etc/sysctl.d/99-majalops-hardening.conf <<'EOF'
fs.protected_fifos = 2
fs.protected_hardlinks = 1
fs.protected_regular = 2
fs.protected_symlinks = 1
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
vm.swappiness = 10
EOF
sysctl --system >/dev/null

if (( SWAP_SIZE_GB > 0 )) && [[ -z "$(swapon --show=NAME --noheadings)" ]]; then
    if [[ ! -e /swapfile ]]; then
        fallocate -l "${SWAP_SIZE_GB}G" /swapfile || \
            dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
        chmod 0600 /swapfile
        mkswap /swapfile
    fi
    swapon /swapfile
fi
if [[ -f /swapfile ]] && ! grep -Eq '^/swapfile[[:space:]]' /etc/fstab; then
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

cat > /etc/logrotate.d/majalops-platform <<'EOF'
/var/log/majalops/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
EOF
logrotate --debug /etc/logrotate.d/majalops-platform >/dev/null

if [[ "$HARDEN_SSH" == "1" ]]; then
    [[ "$CONFIRM_ADMIN_SSH_TESTED" == "YES" ]] || \
        die "Refusing SSH lockdown. First test a separate ${ADMIN_USER} SSH session, then set CONFIRM_ADMIN_SSH_TESTED=YES."
    id -nG "$ADMIN_USER" | tr ' ' '\n' | grep -qx ssh-admins || die "$ADMIN_USER is not in ssh-admins."
    [[ -s "/home/${ADMIN_USER}/.ssh/authorized_keys" ]] || die "$ADMIN_USER has no authorized keys."

    install -d -m 0755 /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/60-majalops-hardening.conf <<EOF
Port ${SSH_PORT}
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowGroups ssh-admins
EOF
    sshd -t
    systemctl reload ssh
    passwd -l root >/dev/null 2>&1 || true
    printf 'SSH lockdown applied. Keep this session open and test a new login immediately.\n'
else
    printf 'SSH lockdown NOT applied. Test: ssh -p %s %s@SERVER_IP\n' "$SSH_PORT" "$ADMIN_USER"
    printf 'Then rerun with HARDEN_SSH=1 CONFIRM_ADMIN_SSH_TESTED=YES.\n'
fi

printf '==> MajalOps bootstrap completed at %s\n' "$(date --iso-8601=seconds)"
printf 'Reboot is recommended if /var/run/reboot-required exists.\n'
