#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SESSION_FILE="${SESSION_FILE:-/var/lib/majalops/demo/session.env}"
[[ "$EUID" -eq 0 ]] || { printf 'Run as root.\n' >&2; exit 1; }
[[ -f "$SESSION_FILE" ]] || { printf 'No active Majal demo session.\n'; exit 0; }

# shellcheck disable=SC1090
source "$SESSION_FILE"
state="stopped"
docker ps --format '{{.Names}}' | grep -qx 'majalops-platform-demo-1' && state="running"
remaining="$(( MAJAL_DEMO_EXPIRES_EPOCH - $(date +%s) ))"
(( remaining < 0 )) && remaining=0

printf 'State: %s\n' "$state"
printf 'URL: https://%s/app\n' "$MAJAL_DEMO_DOMAIN"
printf 'Login: %s\n' "$MAJAL_DEMO_LOGIN"
printf 'Password: %s\n' "$MAJAL_DEMO_PASSWORD"
printf 'Expires: %s (%s minutes remaining)\n' "$MAJAL_DEMO_EXPIRES_AT" "$(( remaining / 60 ))"
printf 'Database: %s\n' "$MAJAL_DEMO_DB"
