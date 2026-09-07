#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

COMPOSE_FILE="${COMPOSE_FILE:-/opt/majalops/infrastructure/docker/compose.platform.yml}"
ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
APP_SERVICE="${APP_SERVICE:-majal}"
EDGE_SERVICE="${EDGE_SERVICE:-caddy}"
TARGET_IMAGE="${TARGET_IMAGE:-}"
# Resolved from the host's own MAJAL_DOMAIN below, once ENV_FILE is known
# to exist. Hardcoding production here meant a staging deploy health-gated
# against production: a broken staging release passed its own gate.
HEALTH_URL="${HEALTH_URL:-}"
CONFIRM_UPDATE="${CONFIRM_UPDATE:-NO}"
CREATE_BACKUP="${CREATE_BACKUP:-YES}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/update-majal.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}
read_migration_flag() {
    # Read the contract out of the image being deployed, not out of the
    # checkout on this host -- the host's copy of the repo can be any age, and
    # the only thing that describes THIS release is the release itself.
    local out
    if ! out="$(docker run --rm --entrypoint cat "$TARGET_IMAGE" \
            /usr/share/doc/majalops/migration-contract.json 2>/dev/null)"; then
        die "Could not read the migration contract from $TARGET_IMAGE. Refusing to migrate a database against a release that does not declare whether the previous image can still read it."
    fi
    local flag
    flag="$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["flag"])' 2>/dev/null)" \
        || die "The migration contract in $TARGET_IMAGE is not readable JSON with a flag."
    case "$flag" in
        none|forward-compatible|restore-required) printf '%s' "$flag" ;;
        *) die "Unknown migration flag '$flag' in $TARGET_IMAGE." ;;
    esac
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

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ "$CONFIRM_UPDATE" == "YES" ]] || die "Set CONFIRM_UPDATE=YES only after release and rollback review."
[[ "$TARGET_IMAGE" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "TARGET_IMAGE must use an immutable sha256 digest."
[[ -f "$COMPOSE_FILE" ]] || die "COMPOSE_FILE not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "ENV_FILE not found: $ENV_FILE"

if [[ -z "$HEALTH_URL" ]]; then
    majal_domain="$(env_value MAJAL_DOMAIN)"
    HEALTH_URL="https://${majal_domain:-platform.majalops.com}/healthz"
fi
command -v docker >/dev/null || die "docker is not installed."

current_image="$(env_value MAJAL_IMAGE)"
[[ "$current_image" =~ @sha256:[a-fA-F0-9]{64}$ ]] || die "Current MAJAL_IMAGE is not an immutable digest."

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

if [[ "$current_image" == "$TARGET_IMAGE" ]]; then
    printf 'No update needed; MAJAL_IMAGE already matches the target digest.\n'
    exit 0
fi

printf 'Rollback before update: take a Hetzner snapshot and retain %s.\n' "$current_image"

# This script DOES migrate the database: the module install and upgrade steps
# below run `odoo -i` and `odoo -u`, which execute every pending Odoo migration
# script in the release. It used to print "This script performs no database
# migration", which was the opposite of the truth and sat directly above the
# rollback the operator was being asked to rely on.
migration_flag="$(read_migration_flag)"
printf 'Release migration contract: %s\n' "$migration_flag"
case "$migration_flag" in
    none)                printf 'This release runs no database migration.\n' ;;
    forward-compatible)  printf 'The previous image can still read a database this release has migrated, so an automatic image rollback stays safe after migration.\n' ;;
    restore-required)    printf 'WARNING: after migration the previous image can NOT read this database. Recovery from a post-migration failure is restore-from-backup, not image revert; this script will refuse to roll the image back on its own.\n' ;;
esac

if [[ "$CREATE_BACKUP" == "YES" ]]; then
    COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
        "$(dirname "$0")/backup.sh"
else
    die "CREATE_BACKUP=NO is not permitted by the standard update path. Use an incident-approved manual procedure."
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
env_backup="${ENV_FILE}.before-update.${timestamp}"
env_tmp="${ENV_FILE}.tmp.$$"
cp -a "$ENV_FILE" "$env_backup"
set_env_value MAJAL_IMAGE "$TARGET_IMAGE" "$ENV_FILE" "$env_tmp"
chmod --reference="$ENV_FILE" "$env_tmp"
chown --reference="$ENV_FILE" "$env_tmp"
mv "$env_tmp" "$ENV_FILE"

# Set to 1 the moment a step that can execute Odoo migration scripts starts.
# Before that point the database is untouched and reverting the image is a
# clean undo; after it, the database has moved and the image is only half the
# state.
migrations_ran=0

rollback_on_failure() {
    local message="$1"
    if [[ "$migrations_ran" == "1" && "$migration_flag" == "restore-required" ]]; then
        # Refusing on purpose. Reverting the image here would leave the
        # previous release running against a database this release has already
        # restructured -- for oca contract 18.0.2.0.0 that means fields moved
        # to other modules and a deleted view -- and the script would report a
        # successful rollback while the system quietly could not read its own
        # data. A restore is the only correct recovery, and only a human can
        # decide to take one.
        printf 'ERROR: %s\n' "$message" >&2
        printf 'REFUSING automatic image rollback: migrations have already run and this release is marked restore-required.\n' >&2
        printf 'The database is migrated; the previous image cannot read it. Do NOT simply revert MAJAL_IMAGE.\n' >&2
        printf 'Recover by restoring the backup taken at the start of this run:\n' >&2
        printf '    %s/restore.sh\n' "$(dirname "$0")" >&2
        printf 'The new image reference is left in place so the running state matches the database. Previous image was: %s\n' "$current_image" >&2
        printf 'Environment before this update is retained at %s\n' "$env_backup" >&2
        exit 1
    fi
    printf 'ERROR: %s Restoring previous image reference.\n' "$message" >&2
    cp -a "$env_backup" "$ENV_FILE"
    compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE" || true
    compose restart "$EDGE_SERVICE" || true
    printf 'Previous image requested: %s\n' "$current_image" >&2
    exit 1
}

compose config --quiet || rollback_on_failure "Compose validation failed."
compose pull "$APP_SERVICE" || rollback_on_failure "Image pull failed."

install_targets="${INSTALL_MODULES:-}"
upgrade_targets="${UPGRADE_MODULES:-}"
pre_install_targets="${PRE_INSTALL_MODULES:-}"
pre_upgrade_targets="${PRE_UPGRADE_MODULES:-}"
module_pattern='^([a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)*)?$'

[[ "$install_targets" =~ $module_pattern ]] || die "INSTALL_MODULES contains invalid characters."
[[ "$upgrade_targets" =~ $module_pattern ]] || die "UPGRADE_MODULES contains invalid characters."
[[ "$pre_install_targets" =~ $module_pattern ]] || die "PRE_INSTALL_MODULES contains invalid characters."
[[ "$pre_upgrade_targets" =~ $module_pattern ]] || die "PRE_UPGRADE_MODULES contains invalid characters."

db_name="$(env_value POSTGRES_DB)"
db_user="$(env_value POSTGRES_USER)"
db_pass="$(env_value POSTGRES_PASSWORD)"

# Odoo module installation and upgrades must have a single registry writer.
# Stop the serving process before any migration command so its cron workers or
# web requests cannot concurrently update ir_module_module.  The database and
# edge services stay online, and rollback_on_failure restores the old app.
if [[ -n "$pre_install_targets" || -n "$pre_upgrade_targets" || -n "$install_targets" || -n "$upgrade_targets" ]]; then
    printf 'Stopping the application service for exclusive module migration...\n'
    compose stop --timeout 120 "$APP_SERVICE" || \
        rollback_on_failure "Application service could not be stopped for migration."
fi

# Some additive releases introduce a new module that becomes a dependency of
# an already-installed module.  Install that foundation, then upgrade the
# existing dependent module before loading bridge data that uses its new
# schema.  Empty by default; ordinary releases keep the shorter path.
if [[ -n "$pre_install_targets" ]]; then
    migrations_ran=1
    printf 'Installing prerequisite application modules...\n'
    compose run --rm "$APP_SERVICE" \
        odoo -d "$db_name" -i "$pre_install_targets" --stop-after-init || \
        rollback_on_failure "Prerequisite module installation step failed."
fi

if [[ -n "$pre_upgrade_targets" ]]; then
    migrations_ran=1
    printf 'Upgrading prerequisite-dependent application modules...\n'
    compose run --rm "$APP_SERVICE" \
        odoo -d "$db_name" -u "$pre_upgrade_targets" --stop-after-init || \
        rollback_on_failure "Prerequisite module upgrade step failed."
fi

# Query requested INSTALL_MODULES that are not currently installed
uninstalled_modules=""
if [[ -n "$install_targets" ]]; then
    uninstalled_modules="$(compose run --rm -e PGPASSWORD="$db_pass" "$APP_SERVICE" psql -h db -U "$db_user" -d "$db_name" -At \
        -v modules="$install_targets" <<'SQL'
SELECT string_agg(wanted.name, ',')
FROM unnest(string_to_array(:'modules', ',')) wanted(name)
LEFT JOIN ir_module_module module
    ON module.name = wanted.name AND module.state = 'installed'
WHERE module.id IS NULL OR module.state != 'installed';
SQL
)" || rollback_on_failure "Install module state query failed."
fi

# Query requested UPGRADE_MODULES that are currently installed
to_upgrade=""
if [[ -n "$upgrade_targets" ]]; then
    to_upgrade="$(compose run --rm -e PGPASSWORD="$db_pass" "$APP_SERVICE" psql -h db -U "$db_user" -d "$db_name" -At \
        -v modules="$upgrade_targets" <<'SQL'
SELECT string_agg(wanted.name, ',')
FROM unnest(string_to_array(:'modules', ',')) wanted(name)
JOIN ir_module_module module
    ON module.name = wanted.name AND module.state = 'installed';
SQL
)" || rollback_on_failure "Upgrade module state query failed."
fi

if [[ -n "$uninstalled_modules" ]]; then
    migrations_ran=1
    printf 'Installing new application modules before upgrading existing modules...\n'
    compose run --rm "$APP_SERVICE" \
        odoo -d "$db_name" -i "$uninstalled_modules" --stop-after-init || \
        rollback_on_failure "Application module installation step failed."
fi

if [[ -n "$to_upgrade" ]]; then
    migrations_ran=1
    printf 'Upgrading existing application modules after dependency installation...\n'
    compose run --rm "$APP_SERVICE" \
        odoo -d "$db_name" -u "$to_upgrade" --stop-after-init || \
        rollback_on_failure "Application module upgrade step failed."
fi

if [[ -z "$uninstalled_modules" && -z "$to_upgrade" ]]; then
    printf 'No module installation or upgrade required for this update.\n'
fi

compose up -d --wait --wait-timeout 900 --no-deps "$APP_SERVICE" || \
    rollback_on_failure "Application recreation or readiness failed."

compose restart "$EDGE_SERVICE" || rollback_on_failure "Edge proxy restart failed."

health_ok=0
for attempt in $(seq 1 12); do
    if HEALTH_URL="$HEALTH_URL" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
        "$(dirname "$0")/healthcheck.sh"; then
        health_ok=1
        break
    fi
    printf 'Health verification retry %s/12 after proxy reconnection.\n' "$attempt"
    sleep 5
done
if [[ "$health_ok" != "1" ]]; then
    rollback_on_failure "Health checks failed."
fi

printf 'Majal update completed: %s\n' "$TARGET_IMAGE"
printf 'Previous environment retained at %s until post-deployment acceptance.\n' "$env_backup"
