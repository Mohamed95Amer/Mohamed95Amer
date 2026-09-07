#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"
[[ "$EUID" -eq 0 ]] || { printf 'ERROR: run as root.\n' >&2; exit 1; }
[[ -d "${INSTALL_ROOT}/systemd" ]] || { printf 'ERROR: systemd templates missing.\n' >&2; exit 1; }

for unit in "${INSTALL_ROOT}"/systemd/*; do
    [[ -f "$unit" ]] || continue
    install -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
done
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/majalops-*.service /etc/systemd/system/majalops-*.timer
printf 'MajalOps systemd units installed and verified.\n'
