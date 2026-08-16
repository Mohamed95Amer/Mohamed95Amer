/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

const LOCALIZED_KEYS = new Set(["label", "hint", "caption", "title", "subtitle", "name", "description"]);
const localizeItems = (value, key = null) => {
    if (Array.isArray(value)) {
        return value.map((item) => localizeItems(item, key));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([childKey, childValue]) => [
                childKey,
                localizeItems(childValue, childKey),
            ])
        );
    }
    return typeof value === "string" && LOCALIZED_KEYS.has(key) ? _t(value) : value;
};

const today = new Date().toISOString().slice(0, 10);

const FACILITY_KPIS = [
    {
        key: "assets",
        label: "Registered assets",
        model: "maintenance.equipment",
        domain: [["active", "=", true]],
        action: "maintenance.hr_equipment_action",
        icon: "fa-cogs",
        tone: "blue",
        hint: "Operating portfolio",
        workspace: "assets",
    },
    {
        key: "workOrders",
        label: "Open work orders",
        model: "maintenance.request",
        domain: [["done", "=", false]],
        action: "maintenance.hr_equipment_request_action",
        icon: "fa-clipboard",
        tone: "teal",
        hint: "Ready for triage",
        workspace: "work_orders",
    },
    {
        key: "pmDue",
        label: "PM plans due",
        model: "facility.pm.plan",
        domain: [["active", "=", true], ["next_date", "<=", today]],
        action: "facility_workorder.action_pm_plan",
        icon: "fa-refresh",
        tone: "sand",
        hint: "Due through today",
        workspace: "pm_plans",
    },
    {
        key: "criticalAssets",
        label: "High-criticality assets",
        model: "maintenance.equipment",
        domain: [["active", "=", true], ["criticality", "in", ["high", "critical"]]],
        action: "maintenance.hr_equipment_action",
        icon: "fa-shield",
        tone: "clay",
        hint: "Risk watchlist",
        workspace: "assets",
    },
];

// The focus panel counts what is *breaching a promise*, not what exists — the
// KPI row below already reports the portfolio. Rendering the same three numbers
// in both places, as this used to, told nobody what to do first.
const FACILITY_FOCUS = [
    {
        key: "slaBreached",
        label: "SLA breached",
        caption: "Promise missed",
        model: "maintenance.request",
        domain: [["sla_breached", "=", true]],
        action: "maintenance.hr_equipment_request_action",
        filter: "sla_breached",
        icon: "fa-bolt",
        workspace: "work_orders",
    },
    {
        key: "slaAtRisk",
        label: "SLA at risk",
        caption: "Save it now",
        model: "maintenance.request",
        domain: ["|", ["sla_response_state", "=", "at_risk"],
                 ["sla_resolution_state", "=", "at_risk"]],
        action: "maintenance.hr_equipment_request_action",
        filter: "sla_at_risk",
        icon: "fa-hourglass-half",
        workspace: "work_orders",
    },
    {
        key: "contractsExpiring",
        label: "Contracts to renew",
        caption: "Ends in 60 days",
        model: "contract.contract",
        domain: [["is_amc", "=", true], ["days_to_expiry", "<=", 60]],
        action: "facility_contract.action_facility_contract",
        icon: "fa-file-text-o",
        workspace: "maintenance_contracts",
    },
];

const FACILITY_GROUPS = [
    {
        title: "Asset portfolio",
        subtitle: "Know what you own and where it is",
        apps: [
            {
                name: "Assets",
                description: "Equipment, ownership, warranties and hierarchy",
                action: "maintenance.hr_equipment_action",
                icon: "fa-cogs",
                tone: "blue",
                workspace: "assets",
            },
            {
                name: "Locations",
                description: "Sites, buildings, floors, rooms and zones",
                action: "facility_asset.action_facility_location",
                icon: "fa-building-o",
                tone: "teal",
                workspace: "locations",
            },
            {
                name: "Floor Plans",
                description: "Find assets and requests on plan",
                action: "facility_floorplan.action_facility_floorplan",
                icon: "fa-map-o",
                tone: "sand",
                workspace: "floor_plans",
            },
            {
                name: "Meters",
                description: "Usage, readings and condition triggers",
                action: "facility_asset.action_meter",
                icon: "fa-tachometer",
                tone: "slate",
                workspace: "meters",
            },
        ],
    },
    {
        title: "Maintenance delivery",
        subtitle: "Plan, dispatch and complete work",
        apps: [
            {
                name: "Work Orders",
                description: "Corrective and preventive maintenance",
                action: "maintenance.hr_equipment_request_action",
                icon: "fa-clipboard",
                tone: "teal",
                workspace: "work_orders",
            },
            {
                name: "PM Plans",
                description: "Calendar and meter-driven generation",
                action: "facility_workorder.action_pm_plan",
                icon: "fa-refresh",
                tone: "blue",
                workspace: "pm_plans",
            },
            {
                name: "Job Plans",
                description: "Reusable tasks, labour and parts",
                action: "facility_workorder.action_job_plan",
                icon: "fa-list-alt",
                tone: "sand",
                workspace: "job_plans",
            },
            {
                name: "Failure Codes",
                description: "Standardize problems, causes and remedies",
                action: "facility_asset.action_failure_code",
                icon: "fa-warning",
                tone: "clay",
                workspace: "failure_codes",
            },
        ],
    },
];

export class FacilityHome extends Component {
    static template = "construction_ui.FacilityHome";

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({
            loading: true,
            kpis: Object.fromEntries(
                [...FACILITY_KPIS, ...FACILITY_FOCUS].map((item) => [item.key, "–"])
            ),
        });
        this.kpiDefinitions = localizeItems(FACILITY_KPIS);
        this.focusItems = localizeItems(FACILITY_FOCUS);
        this.appGroups = localizeItems(FACILITY_GROUPS);
        // Same reasoning as construction_home.js: format in the user's
        // language rather than guessing it from the text direction.
        this.today = new Intl.DateTimeFormat(user.lang, {
            weekday: "long",
            day: "numeric",
            month: "long",
        }).format(new Date());

        onWillStart(async () => {
            const counted = [...FACILITY_KPIS, ...FACILITY_FOCUS];
            const results = await Promise.allSettled(
                counted.map((item) => this.orm.searchCount(item.model, item.domain))
            );
            results.forEach((result, index) => {
                this.state.kpis[counted[index].key] =
                    result.status === "fulfilled" ? result.value : "–";
            });
            this.state.loading = false;
        });
    }

    async openAction(actionXmlId) {
        try {
            await this.action.doAction(actionXmlId);
        } catch {
            this.notification.add(
                _t("This workspace is not available. Check that its module is installed."),
                { type: "warning" }
            );
        }
    }

    async openWorkspace(workspaceKey) {
        await this.openAction(`construction_ui.action_workspace_${workspaceKey}`);
    }

    /** Late work opens the work itself, filtered and labelled, rather than a
     * dashboard the user then has to filter by hand. */
    async openFocus(item) {
        if (item.filter) {
            try {
                await this.action.doAction(item.action, {
                    additionalContext: { [`search_default_${item.filter}`]: 1 },
                });
                return;
            } catch {
                // fall through
            }
        }
        await this.openWorkspace(item.workspace);
    }

    formatAppCount(count) {
        return _t("%s apps", count);
    }
}

registry.category("actions").add("construction_ui.facility_home", FacilityHome);
