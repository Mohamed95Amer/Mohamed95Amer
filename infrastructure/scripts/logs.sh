#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
SERVICE="${SERVICE:-}"
TAIL_LINES="${TAIL_LINES:-200}"
SINCE="${SINCE:-1h}"
FOLLOW="${FOLLOW:-0}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"
[[ "$TAIL_LINES" =~ ^[0-9]+$ ]] || die "TAIL_LINES must be an integer."
command -v docker >/dev/null || die "docker is not installed."

args=(compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --no-color --timestamps --tail "$TAIL_LINES" --since "$SINCE")
[[ "$FOLLOW" == "1" ]] && args+=(--follow)
if [[ -n "$SERVICE" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --services | grep -Fxq "$SERVICE" || \
        die "Unknown SERVICE: $SERVICE"
    args+=("$SERVICE")
fi

docker "${args[@]}"
