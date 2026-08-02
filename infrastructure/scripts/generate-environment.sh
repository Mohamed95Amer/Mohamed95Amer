#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
ODOO_CONFIG_FILE="${ODOO_CONFIG_FILE:-/etc/majalops/odoo.conf}"
MAJAL_DOMAIN="${MAJAL_DOMAIN:-platform.majalops.com}"
TLS_EMAIL="${TLS_EMAIL:-}"
MAJAL_IMAGE="${MAJAL_IMAGE:-}"
CADDY_IMAGE_SOURCE="${CADDY_IMAGE_SOURCE:-caddy:2.11.4-alpine}"
POSTGRES_IMAGE_SOURCE="${POSTGRES_IMAGE_SOURCE:-postgres:16-bookworm}"
BACKUP_HELPER_IMAGE_SOURCE="${BACKUP_HELPER_IMAGE_SOURCE:-alpine:3.20}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/generate-environment.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
existing_value() {
    local key="$1"
    [[ -f "$ENV_FILE" ]] || return 0
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}
secret_or_generate() {
    local key="$1" bytes="$2" current
    current="$(existing_value "$key")"
    if [[ -n "$current" && "$current" != GENERATE_* ]]; then
        printf '%s' "$current"
    else
        openssl rand -base64 "$bytes" | tr -d '\r\n'
    fi
}
resolve_digest() {
    local source_image="$1" digest
    docker pull --quiet "$source_image" >/dev/null
    digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$source_image")"
    [[ "$digest" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "Could not resolve immutable digest for $source_image."
    printf '%s' "$digest"
}
mb_value() { printf '%sMB' "$1"; }

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$MAJAL_DOMAIN" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]] || die "MAJAL_DOMAIN is invalid."
[[ "$TLS_EMAIL" == *@*.* ]] || die "TLS_EMAIL is required and invalid."
command -v docker >/dev/null || die "Docker must be installed first."
command -v openssl >/dev/null || die "openssl is required."

if [[ -z "$MAJAL_IMAGE" ]]; then
    MAJAL_IMAGE="$(existing_value MAJAL_IMAGE)"
fi
[[ "$MAJAL_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "MAJAL_IMAGE must be a GHCR image pinned by sha256 digest."

# The application bind-mounts a non-secret config from this directory while
# the real environment file remains root-only (0600). Execute-only access lets
# the container traverse to odoo.conf without permitting directory listings.
install -d -m 0711 "$(dirname "$ENV_FILE")"
install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Resolving public container image digests...\n'
caddy_image="$(resolve_digest "$CADDY_IMAGE_SOURCE")"
postgres_image="$(resolve_digest "$POSTGRES_IMAGE_SOURCE")"
backup_helper_image="$(resolve_digest "$BACKUP_HELPER_IMAGE_SOURCE")"

postgres_password="$(secret_or_generate POSTGRES_PASSWORD 48)"
database_manager_secret="$(secret_or_generate MAJAL_DATABASE_MANAGER_SECRET 48)"
ai_master_key="$(secret_or_generate MAJAL_AI_MASTER_KEY 32)"
initial_admin_password="$(secret_or_generate MAJAL_INITIAL_ADMIN_PASSWORD 32)"

mem_mb="$(( $(awk '/MemTotal:/ {print $2}' /proc/meminfo) / 1024 ))"
cpu_count="$(nproc)"
(( mem_mb >= 2048 )) || die "At least 2 GiB RAM is required."

shared_mb="$((mem_mb / 4))"
(( shared_mb > 2048 )) && shared_mb=2048
(( shared_mb < 256 )) && shared_mb=256
cache_mb="$((mem_mb * 3 / 5))"
maintenance_mb="$((mem_mb / 16))"
(( maintenance_mb > 512 )) && maintenance_mb=512
(( maintenance_mb < 128 )) && maintenance_mb=128
work_mb="$(( (mem_mb - shared_mb) / 300 ))"
(( work_mb > 32 )) && work_mb=32
(( work_mb < 4 )) && work_mb=4

parallel_workers="$cpu_count"
(( parallel_workers > 8 )) && parallel_workers=8
(( parallel_workers < 2 )) && parallel_workers=2
gather_workers="$((parallel_workers / 2))"
(( gather_workers < 1 )) && gather_workers=1
odoo_workers="$((cpu_count * 2 + 1))"
worker_memory_cap="$((mem_mb / 768))"
(( worker_memory_cap < 2 )) && worker_memory_cap=2
(( odoo_workers > worker_memory_cap )) && odoo_workers="$worker_memory_cap"
(( odoo_workers > 8 )) && odoo_workers=8

env_tmp="${ENV_FILE}.tmp.$$"
cat > "$env_tmp" <<EOF
COMPOSE_PROJECT_NAME=majalops-platform
PLATFORM_ENV_FILE=${ENV_FILE}
CADDYFILE_PATH=/opt/majalops/infrastructure/caddy/Caddyfile
ODOO_CONFIG_FILE=${ODOO_CONFIG_FILE}

MAJAL_DOMAIN=${MAJAL_DOMAIN}
TLS_EMAIL=${TLS_EMAIL}
HEALTH_URL=https://${MAJAL_DOMAIN}/healthz

CADDY_IMAGE=${caddy_image}
POSTGRES_IMAGE=${postgres_image}
BACKUP_HELPER_IMAGE=${backup_helper_image}
MAJAL_IMAGE=${MAJAL_IMAGE}

POSTGRES_DB=majal
POSTGRES_USER=majal_owner
POSTGRES_PASSWORD=${postgres_password}
MAJAL_DATABASE_MANAGER_SECRET=${database_manager_secret}
MAJAL_AI_MASTER_KEY=${ai_master_key}
MAJAL_AI_CA_BUNDLE=
MAJAL_INITIAL_ADMIN_LOGIN=admin@majalops.com
MAJAL_INITIAL_ADMIN_PASSWORD=${initial_admin_password}
MAJAL_MODULES=majal_security,construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,majal_branding,majal_ai,majal_administration,majal_documents,majal_field_offline,om_account_accountant

BACKUP_ROOT=/srv/majalops/backups
BACKUP_RETENTION_DAYS=30

PG_SHARED_BUFFERS=$(mb_value "$shared_mb")
PG_EFFECTIVE_CACHE_SIZE=$(mb_value "$cache_mb")
PG_MAINTENANCE_WORK_MEM=$(mb_value "$maintenance_mb")
PG_WORK_MEM=$(mb_value "$work_mb")
PG_MAX_CONNECTIONS=100
PG_MAX_WORKER_PROCESSES=${parallel_workers}
PG_MAX_PARALLEL_WORKERS=${parallel_workers}
PG_MAX_PARALLEL_WORKERS_PER_GATHER=${gather_workers}
PG_LOG_MIN_DURATION_STATEMENT=1000
EOF
chmod 0600 "$env_tmp"
chown root:root "$env_tmp"
mv "$env_tmp" "$ENV_FILE"

odoo_tmp="${ODOO_CONFIG_FILE}.tmp.$$"
cat > "$odoo_tmp" <<EOF
[options]
addons_path = /mnt/custom-addons,/mnt/oca-addons,/mnt/third-party-addons,/usr/lib/python3/dist-packages/odoo/addons
data_dir = /var/lib/odoo
db_host = db
db_port = 5432
db_user = majal_owner
db_name = majal
dbfilter = ^majal$
list_db = False
server_wide_modules = base,web,majal_branding
proxy_mode = True
workers = ${odoo_workers}
max_cron_threads = 1
limit_request = 8192
limit_time_cpu = 120
limit_time_real = 240
limit_memory_soft = 805306368
limit_memory_hard = 1073741824
log_level = info
log_handler = :INFO,werkzeug:WARNING
without_demo = all
EOF
# This file deliberately contains no credentials; the container entrypoint
# appends the database-manager secret to a private runtime copy. The bind mount
# must remain readable by the unprivileged `odoo` user inside the container.
chmod 0644 "$odoo_tmp"
chown root:root "$odoo_tmp"
mv "$odoo_tmp" "$ODOO_CONFIG_FILE"

printf 'Environment generated without printing secrets: %s\n' "$ENV_FILE"
printf 'Runtime sizing: RAM=%sMB CPU=%s Odoo workers=%s PostgreSQL shared_buffers=%sMB\n' \
    "$mem_mb" "$cpu_count" "$odoo_workers" "$shared_mb"
