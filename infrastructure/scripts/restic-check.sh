#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

RESTIC_ENV_FILE="${RESTIC_ENV_FILE:-/etc/majalops/restic.env}"
[[ "$EUID" -eq 0 ]] || { printf 'ERROR: run as root.\n' >&2; exit 1; }
[[ -f "$RESTIC_ENV_FILE" ]] || { printf 'ERROR: missing %s\n' "$RESTIC_ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$RESTIC_ENV_FILE"
set +a
exec restic check --read-data-subset=5%
