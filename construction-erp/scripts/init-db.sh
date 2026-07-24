#!/usr/bin/env bash
# Initialize a database with the full module stack (with demo data).
#   Docker:     docker compose run --rm odoo odoo -c /etc/odoo/odoo.conf -d erp -i <modules> --stop-after-init
#   Bare-metal: scripts/init-db.sh [dbname]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DB="${1:-erp}"

# Construction suite + the free Odoo Mates full-accounting community app.
MODULES="construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,om_account_accountant"

"$HERE/scripts/run-local.sh" -d "$DB" -i "$MODULES" --stop-after-init "${@:2}"
echo ">> Database '$DB' initialized with: $MODULES"
