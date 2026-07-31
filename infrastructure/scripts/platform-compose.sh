#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"

[[ -f "$ENV_FILE" ]] || { printf 'ERROR: missing %s\n' "$ENV_FILE" >&2; exit 1; }
files=(-f "${INSTALL_ROOT}/docker/compose.platform.yml")
if [[ -f /etc/majalops/alertmanager.yml && -f "${INSTALL_ROOT}/monitoring/compose.monitoring.yml" ]]; then
    files+=(-f "${INSTALL_ROOT}/monitoring/compose.monitoring.yml")
fi
exec docker compose --env-file "$ENV_FILE" "${files[@]}" "$@"
