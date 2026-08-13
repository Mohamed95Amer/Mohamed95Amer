#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

DB_HOST="${HOST:-db}"
DB_PORT="${PORT:-5432}"
DB_USER="${USER:-majal_owner}"
DB_PASSWORD="${PASSWORD:-}"
DB_NAME="${POSTGRES_DB:-}"
MODULES="${MAJAL_DEMO_MODULES:-}"
DEMO_LOGIN="${MAJAL_DEMO_LOGIN:-demo.owner@majal.local}"
DEMO_PASSWORD="${MAJAL_DEMO_PASSWORD:-}"
DEMO_DOMAIN="${MAJAL_DEMO_DOMAIN:-demo.majalops.com}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$DB_NAME" =~ ^majal_demo_[0-9]{8}_[0-9]{6}_[a-f0-9]{6}$ ]] || \
    die "POSTGRES_DB must be an ephemeral Majal demo database name."
[[ -n "$DB_PASSWORD" ]] || die "PASSWORD is required."
[[ -n "$MODULES" ]] || die "MAJAL_DEMO_MODULES is required."
[[ "$MODULES" =~ ^[a-zA-Z0-9_]+(,[a-zA-Z0-9_]+)*$ ]] || die "Invalid module list."
[[ -n "$DEMO_PASSWORD" && "$DEMO_PASSWORD" != "inactive" ]] || die "A generated demo password is required."

export PGPASSWORD="$DB_PASSWORD"
for attempt in $(seq 1 60); do
    pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 && break
    (( attempt == 60 )) && die "PostgreSQL did not become ready."
    sleep 2
done

table_exists="$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atc \
    "SELECT CASE WHEN to_regclass('public.ir_module_module') IS NULL THEN 0 ELSE 1 END")"
if [[ "$table_exists" == "0" ]]; then
    printf 'Loading the isolated Majal demonstration dataset...\n'
    /usr/local/bin/majal-entrypoint odoo -d "$DB_NAME" -i "${MODULES},majal_demo" \
        --load-language=ar_001 --stop-after-init

    /usr/local/bin/majal-entrypoint odoo shell -d "$DB_NAME" --no-http <<'PY'
import os

from odoo.addons.majal_demo.enterprise_demo import seed_enterprise_demo
from odoo.addons.majal_demo.enterprise_facilities_demo import seed_enterprise_facilities_demo

construction = seed_enterprise_demo(env)
facilities = seed_enterprise_facilities_demo(env)
password = os.environ["MAJAL_DEMO_PASSWORD"]
login = os.environ["MAJAL_DEMO_LOGIN"]

demo_users = env["res.users"].sudo().with_context(active_test=False).search([
    ("login", "like", "demo.%@majal.local"),
])
demo_users.write({"password": password, "active": True})

admin = env.ref("base.user_admin")
admin.write({"login": "demo.system@majal.local", "password": password, "active": True})

allowed = demo_users | admin | env.ref("base.user_root")
other_internal = env["res.users"].sudo().with_context(active_test=False).search([
    ("share", "=", False), ("id", "not in", allowed.ids),
])
other_internal.write({"active": False})

env["ir.config_parameter"].sudo().set_param("web.base.url", "https://" + os.environ["MAJAL_DEMO_DOMAIN"])
env["ir.config_parameter"].sudo().set_param("web.base.url.freeze", "True")
env["ir.config_parameter"].sudo().set_param("majal.demo.ephemeral", "True")
env["ir.config_parameter"].sudo().set_param("majal.demo.login", login)

env["ir.cron"].sudo().search([]).write({"active": False})
env["ir.mail_server"].sudo().search([]).write({"active": False})
env.cr.commit()
print({"construction": construction, "facilities": facilities, "users": len(demo_users)})
PY
fi

exec /usr/local/bin/majal-entrypoint "$@" -d "$DB_NAME" \
    --db-filter="^${DB_NAME}$"
