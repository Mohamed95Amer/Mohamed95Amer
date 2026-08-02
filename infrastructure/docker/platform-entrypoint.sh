#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

DB_HOST="${HOST:-db}"
DB_PORT="${PORT:-5432}"
DB_USER="${USER:-majal_owner}"
DB_PASSWORD="${PASSWORD:-}"
DB_NAME="${POSTGRES_DB:-majal}"
MODULES="${MAJAL_MODULES:-}"
ADMIN_LOGIN="${MAJAL_INITIAL_ADMIN_LOGIN:-admin@majalops.com}"
ADMIN_PASSWORD="${MAJAL_INITIAL_ADMIN_PASSWORD:-}"
MARKER="/var/lib/odoo/.majalops-initialized"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -n "$DB_PASSWORD" ]] || die "PASSWORD is required."
[[ -n "$MODULES" ]] || die "MAJAL_MODULES is required."
[[ -n "$ADMIN_LOGIN" ]] || die "MAJAL_INITIAL_ADMIN_LOGIN is required."
[[ -n "$ADMIN_PASSWORD" ]] || die "MAJAL_INITIAL_ADMIN_PASSWORD is required."

export PGPASSWORD="$DB_PASSWORD"
for attempt in $(seq 1 60); do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        break
    fi
    (( attempt == 60 )) && die "PostgreSQL did not become ready."
    sleep 2
done

table_exists="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc \
    "SELECT CASE WHEN to_regclass('public.ir_module_module') IS NULL THEN 0 ELSE 1 END")"
new_database=0
missing_modules=1
if [[ "$table_exists" == "0" ]]; then
    new_database=1
else
    # psql does not perform variable interpolation inside a command supplied
    # with -c. Feed the query on stdin so :'modules' is safely SQL-quoted.
    missing_modules="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -At \
        -v modules="$MODULES" <<'SQL'
SELECT count(*)
FROM unnest(string_to_array(:'modules', ',')) wanted(name)
LEFT JOIN ir_module_module module
    ON module.name = wanted.name
   AND module.state = 'installed'
WHERE module.id IS NULL;
SQL
)"
fi

if [[ "$new_database" == "1" || "$missing_modules" != "0" ]]; then
    printf 'Initializing or completing the MajalOps module stack...\n'
    /usr/local/bin/majal-entrypoint odoo -d "$DB_NAME" -i "$MODULES" \
        --load-language=ar_001 --without-demo=all --stop-after-init
fi

if [[ "$new_database" == "1" ]]; then
    printf 'Applying generated initial administrator credentials...\n'
    /usr/local/bin/majal-entrypoint odoo shell -d "$DB_NAME" --no-http <<'PY'
import os

admin = env.ref("base.user_admin")
admin.write({
    "login": os.environ["MAJAL_INITIAL_ADMIN_LOGIN"],
    "password": os.environ["MAJAL_INITIAL_ADMIN_PASSWORD"],
})
env.cr.commit()
PY
fi

touch "$MARKER"
exec /usr/local/bin/majal-entrypoint "$@"
