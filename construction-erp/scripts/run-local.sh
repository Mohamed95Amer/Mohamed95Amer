#!/usr/bin/env bash
# Run Odoo bare-metal from vendor/odoo (fetched by fetch-odoo.sh) against a
# local PostgreSQL. Useful where Docker is unavailable.
#   scripts/run-local.sh -d erp -i construction_base [any other odoo-bin args]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
ODOO="$HERE/vendor/odoo"
[ -x "$ODOO/odoo-bin" ] || { echo "vendor/odoo missing — run scripts/fetch-odoo.sh first" >&2; exit 1; }

CONF="$HERE/vendor/odoo-local.conf"
if [ ! -f "$CONF" ]; then
    cat > "$CONF" <<EOF
[options]
addons_path = $HERE/custom-addons,$HERE/oca-addons,$ODOO/addons
data_dir = $HERE/vendor/odoo-data
db_host = ${PGHOST:-localhost}
db_user = ${PGUSER:-odoo}
db_password = ${PGPASSWORD:-odoo}
admin_passwd = dev
EOF
fi

exec python3 "$ODOO/odoo-bin" -c "$CONF" "$@"
