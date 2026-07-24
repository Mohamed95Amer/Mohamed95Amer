#!/usr/bin/env bash
# Run the Odoo test suite for one custom module (or all of them).
#   scripts/run-tests.sh construction_boq
#   scripts/run-tests.sh all
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MOD="${1:?usage: run-tests.sh <module|all>}"

if [ "$MOD" = all ]; then
    MODULES="construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_progress_billing"
    TAGS=""
    for m in ${MODULES//,/ }; do TAGS="$TAGS,/$m"; done
    TAGS="${TAGS#,}"
else
    MODULES="$MOD"
    TAGS="/$MOD"
fi

DB="test_erp_$$"
"$HERE/scripts/run-local.sh" -d "$DB" -i "$MODULES" \
    --test-enable --test-tags "$TAGS" --stop-after-init --log-level=test
echo ">> Tests passed for: $MODULES"
