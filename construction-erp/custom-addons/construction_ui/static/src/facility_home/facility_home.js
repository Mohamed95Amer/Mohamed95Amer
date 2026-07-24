/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

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
    },
];

const FACILITY_FOCUS = [
    {
        key: "workOrders",
        label: "Work orders",
        caption: "Triage and assign",
        action: "maintenance.hr_equipment_request_action",
        icon: "fa-clipboard",
    },
    {
        key: "pmDue",
        label: "PM plans",
        caption: "Due through today",
        action: "facility_workorder.action_pm_plan",
        icon: "fa-refresh",
    },
    {
        key: "criticalAssets",
        label: "Critical assets",
        caption: "Review exposure",
        action: "maintenance.hr_equipment_action",
        icon: "fa-shield",
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
            },
            {
                name: "Locations",
                description: "Sites, buildings, floors, rooms and zones",
                action: "facility_asset.action_facility_location",
                icon: "fa-building-o",
                tone: "teal",
            },
            {
                name: "Floor Plans",
                description: "Find assets and requests on plan",
                action: "facility_floorplan.action_facility_floorplan",
                icon: "fa-map-o",
                tone: "sand",
            },
            {
                name: "Meters",
                description: "Usage, readings and condition triggers",
                action: "facility_asset.action_meter",
                icon: "fa-tachometer",
                tone: "slate",
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
            },
            {
                name: "PM Plans",
                description: "Calendar and meter-driven generation",
                action: "facility_workorder.action_pm_plan",
                icon: "fa-refresh",
                tone: "blue",
            },
            {
                name: "Job Plans",
                description: "Reusable tasks, labour and parts",
                action: "facility_workorder.action_job_plan",
                icon: "fa-list-alt",
                tone: "sand",
            },
            {
                name: "Failure Codes",
                description: "Standardize problems, causes and remedies",
                action: "facility_asset.action_failure_code",
                icon: "fa-warning",
                tone: "clay",
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
            kpis: Object.fromEntries(FACILITY_KPIS.map((item) => [item.key, "–"])),
        });
        this.kpiDefinitions = FACILITY_KPIS;
        this.focusItems = FACILITY_FOCUS;
        this.appGroups = FACILITY_GROUPS;
        this.today = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
        }).format(new Date());

        onWillStart(async () => {
            const results = await Promise.allSettled(
                FACILITY_KPIS.map((item) => this.orm.searchCount(item.model, item.domain))
            );
            results.forEach((result, index) => {
                this.state.kpis[FACILITY_KPIS[index].key] =
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
                "This workspace is not available. Check that its module is installed.",
                { type: "warning" }
            );
        }
    }
}

registry.category("actions").add("construction_ui.facility_home", FacilityHome);
