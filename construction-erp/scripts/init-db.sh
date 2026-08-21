#!/usr/bin/env bash
# Initialize a database with the full module stack (with demo data).
#   Docker:     docker compose run --rm odoo odoo -c /etc/odoo/odoo.conf -d erp -i <modules> --stop-after-init
#   Bare-metal: scripts/init-db.sh [dbname]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
DB="${1:-erp}"

# Construction suite + the free Odoo Mates full-accounting community app.
# web_responsive (OCA, vendored at a pinned SHA) is not needed for the app to
# fit a phone — Odoo 18 already does — but it gives the app menu a searchable
# drawer and makes list headers sticky, which is what a long BOQ needs.
MODULES="web_responsive,majal_security,construction_base,majal_approval_studio,construction_boq,construction_drawing,construction_rfi,construction_submittal,construction_pin,construction_planning,construction_defect,construction_daily_log,construction_form,construction_progress_billing,construction_change_order,construction_subcontractor,construction_report,construction_hse,construction_tender,construction_material,construction_dashboard,construction_meeting,construction_bim,construction_whatsapp,construction_portal,facility_asset,facility_workorder,facility_sla,facility_contract,facility_inventory,facility_portal,facility_floorplan,construction_ui,majal_branding,majal_ai,majal_administration,majal_documents,majal_document_intake,majal_sign,majal_api,majal_report_studio,majal_field_offline,majal_workforce,majal_dashboard,majal_sales_ops,om_account_accountant,mis_builder,mis_builder_budget,spreadsheet_oca,spreadsheet_dashboard_oca,spreadsheet_dashboard_purchase_oca"

"$HERE/scripts/run-local.sh" -d "$DB" -i "$MODULES" \
    --load-language=ar_001 --stop-after-init "${@:2}"
echo ">> Database '$DB' initialized with: $MODULES"
