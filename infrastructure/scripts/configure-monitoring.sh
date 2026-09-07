#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/majalops/infrastructure}"
SECRETS_DIR="${SECRETS_DIR:-/etc/majalops/alertmanager-secrets}"
ALERTMANAGER_CONFIG="${ALERTMANAGER_CONFIG:-/etc/majalops/alertmanager.yml}"
PROMETHEUS_CONFIG="${PROMETHEUS_CONFIG:-/etc/majalops/prometheus.yml}"
PROMETHEUS_IMAGE_SOURCE="${PROMETHEUS_IMAGE_SOURCE:-prom/prometheus:latest}"
ALERTMANAGER_IMAGE_SOURCE="${ALERTMANAGER_IMAGE_SOURCE:-prom/alertmanager:latest}"
NODE_EXPORTER_IMAGE_SOURCE="${NODE_EXPORTER_IMAGE_SOURCE:-prom/node-exporter:latest}"
POSTGRES_EXPORTER_IMAGE_SOURCE="${POSTGRES_EXPORTER_IMAGE_SOURCE:-prometheuscommunity/postgres-exporter:latest}"
BLACKBOX_EXPORTER_IMAGE_SOURCE="${BLACKBOX_EXPORTER_IMAGE_SOURCE:-prom/blackbox-exporter:latest}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/configure-monitoring.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
env_value() { awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"; }
resolve_digest() {
    local source_image="$1" digest
    docker pull --quiet "$source_image" >/dev/null
    digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$source_image")"
    [[ "$digest" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "Could not resolve $source_image."
    printf '%s' "$digest"
}
set_env_value() {
    local key="$1" value="$2" source="$3" target="$4"
    awk -v key="$key" -v value="$value" '
        BEGIN { found=0 }
        index($0, key "=") == 1 { print key "=" value; found=1; next }
        { print }
        END { if (!found) print key "=" value }
    ' "$source" > "$target"
}
write_secret() {
    local name="$1" value="$2"
    [[ -n "$value" ]] || return 0
    printf '%s' "$value" > "${SECRETS_DIR}/${name}"
    chmod 0600 "${SECRETS_DIR}/${name}"
}

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ -f "$ENV_FILE" ]] || die "Platform environment not found: $ENV_FILE"
[[ -f "${INSTALL_ROOT}/monitoring/prometheus.yml.template" ]] || die "Monitoring templates are missing."

install -d -m 0700 "$SECRETS_DIR"
install -d -m 0755 /var/lib/majalops/node-exporter
install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE" && chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Resolving monitoring image digests...\n'
declare -A images=(
    [PROMETHEUS_IMAGE]="$(resolve_digest "$PROMETHEUS_IMAGE_SOURCE")"
    [ALERTMANAGER_IMAGE]="$(resolve_digest "$ALERTMANAGER_IMAGE_SOURCE")"
    [NODE_EXPORTER_IMAGE]="$(resolve_digest "$NODE_EXPORTER_IMAGE_SOURCE")"
    [POSTGRES_EXPORTER_IMAGE]="$(resolve_digest "$POSTGRES_EXPORTER_IMAGE_SOURCE")"
    [BLACKBOX_EXPORTER_IMAGE]="$(resolve_digest "$BLACKBOX_EXPORTER_IMAGE_SOURCE")"
)
for key in "${!images[@]}"; do
    tmp="${ENV_FILE}.tmp.$$"
    set_env_value "$key" "${images[$key]}" "$ENV_FILE" "$tmp"
    chmod 0600 "$tmp" && chown root:root "$tmp" && mv "$tmp" "$ENV_FILE"
done

domain="$(env_value MAJAL_DOMAIN)"
sed "s/__MAJAL_DOMAIN__/${domain}/g" "${INSTALL_ROOT}/monitoring/prometheus.yml.template" > "$PROMETHEUS_CONFIG"
chmod 0644 "$PROMETHEUS_CONFIG"

write_secret slack_webhook_url "${SLACK_WEBHOOK_URL:-}"
write_secret teams_webhook_url "${TEAMS_WEBHOOK_URL:-}"
write_secret discord_webhook_url "${DISCORD_WEBHOOK_URL:-}"
write_secret generic_webhook_url "${GENERIC_WEBHOOK_URL:-}"
write_secret smtp_password "${SMTP_PASSWORD:-}"

cat > "$ALERTMANAGER_CONFIG" <<'EOF'
global:
  resolve_timeout: 5m
route:
  receiver: majalops-notifications
  group_by: [alertname, severity]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
receivers:
  - name: majalops-notifications
EOF

if [[ -n "${ALERT_EMAIL_TO:-}" ]]; then
    [[ -n "${SMTP_SMARTHOST:-}" && -n "${SMTP_FROM:-}" && -n "${SMTP_USERNAME:-}" && -n "${SMTP_PASSWORD:-}" ]] || \
        die "Email requires SMTP_SMARTHOST, SMTP_FROM, SMTP_USERNAME and SMTP_PASSWORD."
    cat >> "$ALERTMANAGER_CONFIG" <<EOF
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
        from: '${SMTP_FROM}'
        smarthost: '${SMTP_SMARTHOST}'
        auth_username: '${SMTP_USERNAME}'
        auth_password_file: /etc/alertmanager/secrets/smtp_password
        require_tls: true
        send_resolved: true
EOF
fi
if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    cat >> "$ALERTMANAGER_CONFIG" <<'EOF'
    slack_configs:
      - api_url_file: /etc/alertmanager/secrets/slack_webhook_url
        send_resolved: true
EOF
fi
if [[ -n "${TEAMS_WEBHOOK_URL:-}" ]]; then
    cat >> "$ALERTMANAGER_CONFIG" <<'EOF'
    msteamsv2_configs:
      - webhook_url_file: /etc/alertmanager/secrets/teams_webhook_url
        send_resolved: true
EOF
fi
if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
    cat >> "$ALERTMANAGER_CONFIG" <<'EOF'
    discord_configs:
      - webhook_url_file: /etc/alertmanager/secrets/discord_webhook_url
        send_resolved: true
EOF
fi
if [[ -n "${GENERIC_WEBHOOK_URL:-}" ]]; then
    cat >> "$ALERTMANAGER_CONFIG" <<'EOF'
    webhook_configs:
      - url_file: /etc/alertmanager/secrets/generic_webhook_url
        send_resolved: true
EOF
fi
chmod 0640 "$ALERTMANAGER_CONFIG"

prometheus_image="${images[PROMETHEUS_IMAGE]}"
alertmanager_image="${images[ALERTMANAGER_IMAGE]}"
alertmanager_uid="$(docker run --rm --entrypoint id "$alertmanager_image" -u)"
alertmanager_gid="$(docker run --rm --entrypoint id "$alertmanager_image" -g)"
[[ "$alertmanager_uid" =~ ^[0-9]+$ && "$alertmanager_gid" =~ ^[0-9]+$ ]] || \
    die "Could not determine the Alertmanager runtime identity."
chown "$alertmanager_uid:$alertmanager_gid" "$ALERTMANAGER_CONFIG" "$SECRETS_DIR"
find "$SECRETS_DIR" -maxdepth 1 -type f -exec chown "$alertmanager_uid:$alertmanager_gid" {} +
docker run --rm --entrypoint /bin/promtool \
    -v "${PROMETHEUS_CONFIG}:/etc/prometheus/prometheus.yml:ro" \
    -v "${INSTALL_ROOT}/monitoring/alerts.yml:/etc/prometheus/alerts.yml:ro" \
    "$prometheus_image" check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint /bin/amtool \
    -v "${ALERTMANAGER_CONFIG}:/etc/alertmanager/alertmanager.yml:ro" \
    -v "${SECRETS_DIR}:/etc/alertmanager/secrets:ro" \
    "$alertmanager_image" check-config /etc/alertmanager/alertmanager.yml

docker compose --env-file "$ENV_FILE" \
    -f "${INSTALL_ROOT}/docker/compose.platform.yml" \
    -f "${INSTALL_ROOT}/monitoring/compose.monitoring.yml" up -d
printf 'Monitoring configured. Prometheus and Alertmanager listen on server loopback only.\n'
