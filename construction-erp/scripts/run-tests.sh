#!/usr/bin/env bash
# Run the Odoo test suite for one custom module (or all of them).
#   scripts/run-tests.sh construction_boq
#   scripts/run-tests.sh all
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MOD="${1:?usage: run-tests.sh <module|all>}"

if [ "$MOD" = all ]; then
    MODULES="majal_security,construction_base,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,majal_branding,majal_ai,majal_administration,majal_documents,majal_field_offline,majal_workforce,majal_real_estate,majal_property_listing,majal_property_construction,majal_property_operations,majal_property_facilities,majal_property_administration,majal_property_ownership"
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
