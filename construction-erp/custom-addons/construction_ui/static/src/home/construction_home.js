/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const KPI_DEFINITIONS = [
    {
        key: "projects",
        label: "Active projects",
        model: "project.project",
        domain: [["is_construction", "=", true], ["active", "=", true]],
        action: "construction_base.action_construction_projects",
        icon: "fa-building-o",
        tone: "navy",
        hint: "Current portfolio",
        workspace: "projects",
    },
    {
        key: "rfi",
        label: "Open RFIs",
        model: "construction.rfi",
        domain: [["state", "not in", ["closed", "cancelled"]]],
        action: "construction_rfi.action_construction_rfi",
        icon: "fa-question-circle",
        tone: "amber",
        hint: "Awaiting resolution",
        workspace: "rfis",
    },
    {
        key: "defects",
        label: "Open defects",
        model: "construction.defect",
        domain: [["state", "not in", ["closed", "cancelled"]]],
        action: "construction_defect.action_construction_defect",
        icon: "fa-exclamation-triangle",
        tone: "coral",
        hint: "Site attention",
        workspace: "defects",
    },
    {
        key: "inspections",
        label: "Inspections due",
        model: "construction.form.inspection",
        domain: [["state", "in", ["draft", "in_progress"]]],
        action: "construction_form.action_form_inspections",
        icon: "fa-check-square-o",
        tone: "teal",
        hint: "Ready to progress",
        workspace: "inspections",
    },
];

const CONSTRUCTION_FOCUS = [
    {
        key: "rfi",
        label: "Open RFIs",
        caption: "Clear information flow",
        action: "construction_rfi.action_construction_rfi",
        icon: "fa-question-circle",
        workspace: "rfis",
    },
    {
        key: "defects",
        label: "Open defects",
        caption: "Protect quality",
        action: "construction_defect.action_construction_defect",
        icon: "fa-exclamation-triangle",
        workspace: "defects",
    },
    {
        key: "inspections",
        label: "Inspections",
        caption: "Move work forward",
        action: "construction_form.action_form_inspections",
        icon: "fa-check-square-o",
        workspace: "inspections",
    },
];

const APP_GROUPS = [
    {
        title: "Field operations",
        subtitle: "Keep site teams moving",
        apps: [
            {
                name: "Plan Viewer",
                description: "Open drawings and work with live pins",
                action: "construction_pin.action_plan_viewer",
                icon: "fa-map-o",
                tone: "blue",
                workspace: "plan_viewer",
            },
            {
                name: "Daily Site Logs",
                description: "Capture labour, equipment and delays",
                action: "construction_daily_log.action_construction_daily_log",
                icon: "fa-sun-o",
                tone: "amber",
                workspace: "daily_logs",
            },
            {
                name: "Forms & Inspections",
                description: "Run checklists and field inspections",
                action: "construction_form.action_form_inspections",
                icon: "fa-check-square-o",
                tone: "teal",
                workspace: "inspections",
            },
            {
                name: "Defects",
                description: "Track punch-list and DLP items",
                action: "construction_defect.action_construction_defect",
                icon: "fa-wrench",
                tone: "coral",
                workspace: "defects",
            },
        ],
    },
    {
        title: "Engineering",
        subtitle: "Control information and programme",
        apps: [
            {
                name: "Drawings",
                description: "Revision-controlled drawing register",
                action: "construction_drawing.action_construction_drawing",
                icon: "fa-file-pdf-o",
                tone: "violet",
                workspace: "drawings",
            },
            {
                name: "RFIs",
                description: "Questions, responses and ball-in-court",
                action: "construction_rfi.action_construction_rfi",
                icon: "fa-question-circle",
                tone: "blue",
                workspace: "rfis",
            },
            {
                name: "Submittals",
                description: "Multi-reviewer approval workflows",
                action: "construction_submittal.action_construction_submittal",
                icon: "fa-share-square-o",
                tone: "teal",
                workspace: "submittals",
            },
            {
                name: "Programme",
                description: "WBS, dependencies and critical path",
                action: "construction_planning.action_construction_planning",
                icon: "fa-calendar",
                tone: "navy",
                workspace: "programme",
            },
        ],
    },
    {
        title: "Commercial",
        subtitle: "Protect cost, cash and margin",
        apps: [
            {
                name: "Bill of Quantities",
                description: "Budget, cost split and revisions",
                action: "construction_boq.action_construction_boq",
                icon: "fa-list-ol",
                tone: "blue",
                workspace: "boq",
            },
            {
                name: "Change Orders",
                description: "Price and approve variations",
                action: "construction_change_order.action_change_order",
                icon: "fa-exchange",
                tone: "amber",
                workspace: "change_orders",
            },
            {
                name: "Progress Billing",
                description: "IPCs, retention and certification",
                action: "construction_progress_billing.action_progress_claim",
                icon: "fa-money",
                tone: "teal",
                workspace: "progress_billing",
            },
            {
                name: "Subcontracts",
                description: "Commitments, claims and back-charges",
                action: "construction_subcontractor.action_subcontract",
                icon: "fa-handshake-o",
                tone: "violet",
                workspace: "subcontracts",
            },
        ],
    },
    {
        title: "Facilities",
        subtitle: "Operate assets after handover",
        apps: [
            {
                name: "Assets",
                description: "Equipment, meters and warranties",
                action: "maintenance.hr_equipment_action",
                icon: "fa-cogs",
                tone: "navy",
                workspace: "assets",
            },
            {
                name: "Work Orders",
                description: "Corrective and preventive maintenance",
                action: "maintenance.hr_equipment_request_action",
                icon: "fa-clipboard",
                tone: "coral",
                workspace: "work_orders",
            },
            {
                name: "PM Plans",
                description: "Calendar and meter-based maintenance",
                action: "facility_workorder.action_pm_plan",
                icon: "fa-refresh",
                tone: "teal",
                workspace: "pm_plans",
            },
            {
                name: "Floor Plans",
                description: "Locate assets and requests visually",
                action: "facility_floorplan.action_facility_floorplan",
                icon: "fa-map-marker",
                tone: "blue",
                workspace: "floor_plans",
            },
        ],
    },
];

export class ConstructionHome extends Component {
    static template = "construction_ui.ConstructionHome";

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({
            loading: true,
            kpis: Object.fromEntries(KPI_DEFINITIONS.map((item) => [item.key, "–"])),
        });
        this.kpiDefinitions = KPI_DEFINITIONS;
        this.focusItems = CONSTRUCTION_FOCUS;
        this.appGroups = APP_GROUPS;
        this.today = new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
        }).format(new Date());

        onWillStart(async () => {
            const results = await Promise.allSettled(
                KPI_DEFINITIONS.map((item) =>
                    this.orm.searchCount(item.model, item.domain)
                )
            );
            results.forEach((result, index) => {
                this.state.kpis[KPI_DEFINITIONS[index].key] =
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
                "This workspace is not available yet. Check that its module is installed.",
                { type: "warning" }
            );
        }
    }

    async openWorkspace(workspaceKey) {
        await this.openAction(`construction_ui.action_workspace_${workspaceKey}`);
    }
}

registry.category("actions").add("construction_ui.home", ConstructionHome);
