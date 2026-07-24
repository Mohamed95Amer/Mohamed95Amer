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
    },
    {
        key: "rfi",
        label: "Open RFIs",
        model: "construction.rfi",
        domain: [["state", "not in", ["closed", "cancelled"]]],
        action: "construction_rfi.action_construction_rfi",
        icon: "fa-question-circle",
        tone: "amber",
    },
    {
        key: "defects",
        label: "Open defects",
        model: "construction.defect",
        domain: [["state", "not in", ["closed", "cancelled"]]],
        action: "construction_defect.action_construction_defect",
        icon: "fa-exclamation-triangle",
        tone: "coral",
    },
    {
        key: "inspections",
        label: "Inspections due",
        model: "construction.form.inspection",
        domain: [["state", "in", ["draft", "in_progress"]]],
        action: "construction_form.action_form_inspections",
        icon: "fa-check-square-o",
        tone: "teal",
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
            },
            {
                name: "Daily Site Logs",
                description: "Capture labour, equipment and delays",
                action: "construction_daily_log.action_construction_daily_log",
                icon: "fa-sun-o",
                tone: "amber",
            },
            {
                name: "Forms & Inspections",
                description: "Run checklists and field inspections",
                action: "construction_form.action_form_inspections",
                icon: "fa-check-square-o",
                tone: "teal",
            },
            {
                name: "Defects",
                description: "Track punch-list and DLP items",
                action: "construction_defect.action_construction_defect",
                icon: "fa-wrench",
                tone: "coral",
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
            },
            {
                name: "RFIs",
                description: "Questions, responses and ball-in-court",
                action: "construction_rfi.action_construction_rfi",
                icon: "fa-question-circle",
                tone: "blue",
            },
            {
                name: "Submittals",
                description: "Multi-reviewer approval workflows",
                action: "construction_submittal.action_construction_submittal",
                icon: "fa-share-square-o",
                tone: "teal",
            },
            {
                name: "Programme",
                description: "WBS, dependencies and critical path",
                action: "construction_planning.action_construction_planning",
                icon: "fa-calendar",
                tone: "navy",
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
            },
            {
                name: "Change Orders",
                description: "Price and approve variations",
                action: "construction_change_order.action_change_order",
                icon: "fa-exchange",
                tone: "amber",
            },
            {
                name: "Progress Billing",
                description: "IPCs, retention and certification",
                action: "construction_progress_billing.action_progress_claim",
                icon: "fa-money",
                tone: "teal",
            },
            {
                name: "Subcontracts",
                description: "Commitments, claims and back-charges",
                action: "construction_subcontractor.action_subcontract",
                icon: "fa-handshake-o",
                tone: "violet",
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
            },
            {
                name: "Work Orders",
                description: "Corrective and preventive maintenance",
                action: "maintenance.hr_equipment_request_action",
                icon: "fa-clipboard",
                tone: "coral",
            },
            {
                name: "PM Plans",
                description: "Calendar and meter-based maintenance",
                action: "facility_workorder.action_pm_plan",
                icon: "fa-refresh",
                tone: "teal",
            },
            {
                name: "Floor Plans",
                description: "Locate assets and requests visually",
                action: "facility_floorplan.action_facility_floorplan",
                icon: "fa-map-marker",
                tone: "blue",
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
}

registry.category("actions").add("construction_ui.home", ConstructionHome);
