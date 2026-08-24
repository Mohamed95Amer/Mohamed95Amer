#!/usr/bin/env bash
# Run the Odoo test suite for one custom module (or all of them).
#   scripts/run-tests.sh construction_boq
#   scripts/run-tests.sh all
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
MOD="${1:?usage: run-tests.sh <module|all>}"

if [ "$MOD" = all ]; then
    # The union of both branches. Each side had modules the other had never
    # seen -- six on the construction side (approval studio, document intake,
    # sign, api, report studio, dashboard) and twelve on the property side --
    # so taking either list wholesale would have silently stopped testing
    # half the suite while still reporting a pass.
    MODULES="majal_security,construction_base,majal_approval_studio,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,majal_branding,majal_ai,majal_administration,majal_documents,majal_document_intake,majal_sign,majal_api,majal_report_studio,majal_field_offline,majal_workforce,majal_dashboard,majal_integrations,majal_real_estate,majal_property_listing,majal_property_construction,majal_property_operations,majal_property_facilities,majal_property_administration,majal_property_ownership,majal_property_account,majal_property_integrations,majal_property_ui,majal_demo"
    TAGS=""
    for m in ${MODULES//,/ }; do TAGS="$TAGS,/$m"; done
    # Installed so that a clash between them and ours fails here rather than
    # on somebody's server, but not tagged: OCA's suites are OCA's to keep
    # green, and adopting them means this build goes red for their
    # regressions.
    MODULES="$MODULES,mis_builder,spreadsheet_oca,spreadsheet_dashboard_oca"
    TAGS="${TAGS#,}"
else
    MODULES="$MOD"
    TAGS="/$MOD"
fi

DB="test_erp_$$"
"$HERE/scripts/run-local.sh" -d "$DB" -i "$MODULES" \
    --test-enable --test-tags "$TAGS" --stop-after-init --log-level=test
echo ">> Tests passed for: $MODULES"
