/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const daysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return `${date.toISOString().slice(0, 10)} 00:00:00`;
};

const workspace = (values) => ({
    area: "construction",
    tone: "blue",
    allowCreate: true,
    domain: [],
    createContext: {},
    workflow: [
        ["Capture", "Create and classify the operational record."],
        ["Coordinate", "Assign ownership and move the work forward."],
        ["Close", "Complete the record with a clear audit trail."],
    ],
    related: [],
    ...values,
});

export const WORKSPACES = {
    projects: workspace({
        title: "Project Portfolio",
        eyebrow: "PORTFOLIO CONTROL",
        description: "A single view of active projects, delivery activity and recently updated project records.",
        model: "project.project",
        action: "construction_base.action_construction_projects",
        icon: "fa-building-o",
        tone: "navy",
        domain: [["is_construction", "=", true]],
        createContext: { default_is_construction: true },
        workflow: [
            ["Mobilise", "Set the project team, dates and commercial baseline."],
            ["Deliver", "Coordinate engineering, site and commercial workstreams."],
            ["Handover", "Close delivery and transition assets into operations."],
        ],
        related: ["programme", "drawings", "boq", "daily_logs"],
    }),
    site_work: workspace({
        title: "Site Work Control",
        eyebrow: "ON-SITE DELIVERY",
        description: "A project-aware landing page for daily records, structured forms, inspections, quantities and field observations.",
        model: "construction.form.inspection",
        action: "construction_form.action_form_inspections",
        icon: "fa-hard-hat",
        tone: "sand",
        workflow: [
            ["Plan", "Select the project, location, form and responsible field team."],
            ["Capture", "Record quantities, checks, photos, signatures and daily evidence."],
            ["Coordinate", "Route exceptions into defects, RFIs or technical approvals."],
        ],
        related: ["daily_logs", "inspections", "boq", "plan_viewer"],
    }),
    quality_hub: workspace({
        title: "Quality & QA",
        eyebrow: "ASSURANCE & CLOSE-OUT",
        description: "Control inspections, quality assurance forms, snags, observations and technical submittals from one place.",
        model: "construction.defect",
        action: "construction_defect.action_construction_defect",
        icon: "fa-shield",
        tone: "teal",
        workflow: [
            ["Inspect", "Run the planned check and capture objective field evidence."],
            ["Resolve", "Assign observations and verify corrective action."],
            ["Approve", "Close the record with a traceable decision and sign-off."],
        ],
        related: ["inspections", "defects", "submittals", "drawings"],
    }),
    engineering_hub: workspace({
        title: "Engineering & Information",
        eyebrow: "DESIGN COORDINATION",
        description: "Coordinate drawings, revisions, RFIs and submittals with a controlled approval trail.",
        model: "construction.drawing",
        action: "construction_drawing.action_construction_drawing",
        icon: "fa-sitemap",
        tone: "violet",
        allowCreate: false,
        workflow: [
            ["Register", "Structure the drawing and information registers by project."],
            ["Review", "Coordinate RFIs, submittals and drawing revision comments."],
            ["Release", "Sign off and publish the approved information set."],
        ],
        related: ["drawings", "rfis", "submittals", "plan_viewer"],
    }),
    commercial_hub: workspace({
        title: "Commercial Control",
        eyebrow: "COST & CONTRACT",
        description: "Connect tender documents, quotations, sales orders, BOQs, change and payment control.",
        model: "majal.project.document",
        action: "construction_ui.action_majal_project_documents",
        icon: "fa-line-chart",
        tone: "navy",
        allowCreate: false,
        workflow: [
            ["Baseline", "Capture tender, contract, quantities, costs and target margin."],
            ["Control", "Evaluate changes, commitments and measured progress."],
            ["Certify", "Approve commercial documents and payment outcomes."],
        ],
        related: ["boq", "change_orders", "progress_billing", "subcontracts"],
    }),
    plan_viewer: workspace({
        title: "Plan Viewer",
        eyebrow: "VISUAL FIELD CONTROL",
        description: "Navigate the latest drawings and work with location-based pins from one visual workspace.",
        model: "construction.pin",
        action: "construction_pin.action_plan_viewer",
        icon: "fa-map-o",
        tone: "blue",
        allowCreate: false,
        workflow: [
            ["Select", "Open the relevant project drawing and revision."],
            ["Locate", "Review live RFIs, defects and observations on plan."],
            ["Act", "Open the linked record and coordinate its resolution."],
        ],
        related: ["drawings", "rfis", "defects", "inspections"],
    }),
    daily_logs: workspace({
        title: "Daily Site Logs",
        eyebrow: "FIELD OPERATIONS",
        description: "Monitor manpower, equipment, activities, weather and delays recorded by the site team.",
        model: "construction.daily.log",
        action: "construction_daily_log.action_construction_daily_log",
        icon: "fa-sun-o",
        tone: "sand",
        related: ["projects", "programme", "inspections", "defects"],
    }),
    inspections: workspace({
        title: "Forms & Inspections",
        eyebrow: "ASSURANCE WORKFLOW",
        description: "Run structured field checks, capture evidence and keep approvals moving.",
        model: "construction.form.inspection",
        action: "construction_form.action_form_inspections",
        icon: "fa-check-square-o",
        tone: "teal",
        workflow: [
            ["Prepare", "Choose a template and define the inspection scope."],
            ["Inspect", "Complete checks, evidence and field observations."],
            ["Approve", "Review the result and close or raise follow-up work."],
        ],
        related: ["defects", "plan_viewer", "daily_logs", "projects"],
    }),
    defects: workspace({
        title: "Defects & Punch List",
        eyebrow: "QUALITY CONTROL",
        description: "Prioritise defects, clarify responsibility and protect close-out quality.",
        model: "construction.defect",
        action: "construction_defect.action_construction_defect",
        icon: "fa-wrench",
        tone: "clay",
        workflow: [
            ["Identify", "Capture location, severity, trade and evidence."],
            ["Rectify", "Assign responsibility and track corrective work."],
            ["Verify", "Inspect the result and close with evidence."],
        ],
        related: ["inspections", "plan_viewer", "subcontracts", "daily_logs"],
    }),
    drawings: workspace({
        title: "Drawing Register",
        eyebrow: "DESIGN INFORMATION",
        description: "Control drawing metadata, revisions and the current approved information set.",
        model: "construction.drawing",
        action: "construction_drawing.action_construction_drawing",
        icon: "fa-file-pdf-o",
        tone: "violet",
        workflow: [
            ["Register", "Create the drawing record and classify its discipline."],
            ["Revise", "Upload revisions and record their issue purpose."],
            ["Publish", "Mark the correct revision current for project use."],
        ],
        related: ["plan_viewer", "rfis", "submittals", "programme"],
    }),
    rfis: workspace({
        title: "Requests for Information",
        eyebrow: "INFORMATION FLOW",
        description: "Track questions, ball-in-court ownership, responses and closure across the project team.",
        model: "construction.rfi",
        action: "construction_rfi.action_construction_rfi",
        icon: "fa-question-circle",
        tone: "blue",
        workflow: [
            ["Raise", "Describe the information gap and reference project context."],
            ["Respond", "Coordinate ownership, review and formal response."],
            ["Close", "Confirm the answer resolves the field requirement."],
        ],
        related: ["drawings", "submittals", "plan_viewer", "programme"],
    }),
    submittals: workspace({
        title: "Submittals",
        eyebrow: "TECHNICAL APPROVALS",
        description: "Coordinate technical submissions, multi-reviewer decisions and approval status.",
        model: "construction.submittal",
        action: "construction_submittal.action_construction_submittal",
        icon: "fa-share-square-o",
        tone: "teal",
        workflow: [
            ["Submit", "Package the technical information and required evidence."],
            ["Review", "Coordinate reviewers, comments and response cycles."],
            ["Release", "Record the final decision and approved information."],
        ],
        related: ["drawings", "rfis", "programme", "projects"],
    }),
    programme: workspace({
        title: "Programme & Planning",
        eyebrow: "DELIVERY PLANNING",
        description: "Manage the WBS, task ownership, dependencies and the path to on-time delivery.",
        model: "project.task",
        action: "construction_planning.action_construction_planning",
        icon: "fa-calendar",
        tone: "navy",
        related: ["projects", "daily_logs", "rfis", "submittals"],
    }),
    boq: workspace({
        title: "Bill of Quantities",
        eyebrow: "COST BASELINE",
        description: "Control measured scope, quantities, rates and the commercial baseline for each project.",
        model: "construction.boq",
        action: "construction_boq.action_construction_boq",
        icon: "fa-list-ol",
        tone: "blue",
        workflow: [
            ["Build", "Structure sections, scope items, quantities and rates."],
            ["Review", "Validate the baseline against project scope."],
            ["Control", "Use the approved baseline for change and payment."],
        ],
        related: ["change_orders", "progress_billing", "subcontracts", "projects"],
    }),
    change_orders: workspace({
        title: "Change Control",
        eyebrow: "COMMERCIAL GOVERNANCE",
        description: "Capture change events, evaluate impact and maintain an auditable variation workflow.",
        model: "construction.change.order",
        action: "construction_change_order.action_change_order",
        icon: "fa-exchange",
        tone: "sand",
        workflow: [
            ["Identify", "Register the event, cause and affected project scope."],
            ["Evaluate", "Assess cost, time and supporting information."],
            ["Approve", "Record the decision and update commercial control."],
        ],
        related: ["boq", "progress_billing", "subcontracts", "rfis"],
    }),
    progress_billing: workspace({
        title: "Progress Billing",
        eyebrow: "PAYMENT CONTROL",
        description: "Prepare progress claims, certify measured work and track retention and amounts due.",
        model: "construction.progress.claim",
        action: "construction_progress_billing.action_progress_claim",
        icon: "fa-money",
        tone: "teal",
        workflow: [
            ["Measure", "Capture current-period quantities and cumulative progress."],
            ["Certify", "Review valuation, retention and the amount due."],
            ["Settle", "Create the invoice and track payment completion."],
        ],
        related: ["boq", "change_orders", "subcontracts", "projects"],
    }),
    subcontracts: workspace({
        title: "Subcontracts",
        eyebrow: "SUPPLY CHAIN CONTROL",
        description: "Manage subcontract scope, commitments, certificates, retention and back-charges.",
        model: "construction.subcontract",
        action: "construction_subcontractor.action_subcontract",
        icon: "fa-handshake-o",
        tone: "violet",
        workflow: [
            ["Commit", "Define the subcontract scope, value and commercial terms."],
            ["Certify", "Measure progress and control payment certificates."],
            ["Close", "Resolve retention, back-charges and final obligations."],
        ],
        related: ["boq", "progress_billing", "defects", "change_orders"],
    }),
    assets: workspace({
        area: "facilities",
        title: "Asset Portfolio",
        eyebrow: "ASSET INTELLIGENCE",
        description: "Understand the equipment portfolio, criticality, ownership and maintenance context.",
        model: "maintenance.equipment",
        action: "maintenance.hr_equipment_action",
        icon: "fa-cogs",
        tone: "blue",
        workflow: [
            ["Register", "Capture identity, location, ownership and warranty data."],
            ["Maintain", "Connect work orders, PM plans, meters and job plans."],
            ["Optimise", "Review performance, risk and lifecycle decisions."],
        ],
        related: ["work_orders", "pm_plans", "locations", "meters"],
    }),
    work_orders: workspace({
        area: "facilities",
        title: "Maintenance Work Orders",
        eyebrow: "WORK DELIVERY",
        description: "Triage, assign and complete corrective and preventive maintenance work.",
        model: "maintenance.request",
        action: "maintenance.hr_equipment_request_action",
        icon: "fa-clipboard",
        tone: "teal",
        workflow: [
            ["Triage", "Confirm priority, asset, location and required response."],
            ["Execute", "Assign the team and complete the maintenance work."],
            ["Close", "Record resolution, time, cause and follow-up actions."],
        ],
        related: ["assets", "pm_plans", "job_plans", "failure_codes"],
    }),
    pm_plans: workspace({
        area: "facilities",
        title: "Preventive Maintenance",
        eyebrow: "RELIABILITY PLANNING",
        description: "Plan calendar and meter-driven maintenance before assets fail.",
        model: "facility.pm.plan",
        action: "facility_workorder.action_pm_plan",
        icon: "fa-refresh",
        tone: "sand",
        related: ["assets", "work_orders", "job_plans", "meters"],
    }),
    job_plans: workspace({
        area: "facilities",
        title: "Maintenance Job Plans",
        eyebrow: "STANDARD WORK",
        description: "Create reusable maintenance methods, tasks, labour guidance and parts requirements.",
        model: "facility.job.plan",
        action: "facility_workorder.action_job_plan",
        icon: "fa-list-alt",
        tone: "sand",
        related: ["pm_plans", "work_orders", "assets", "failure_codes"],
    }),
    locations: workspace({
        area: "facilities",
        title: "Location Hierarchy",
        eyebrow: "SPACE & LOCATION",
        description: "Navigate sites, buildings, floors, rooms and zones with connected operational records.",
        model: "facility.location",
        action: "facility_asset.action_facility_location",
        icon: "fa-building-o",
        tone: "teal",
        related: ["floor_plans", "assets", "work_orders", "meters"],
    }),
    floor_plans: workspace({
        area: "facilities",
        title: "Facility Floor Plans",
        eyebrow: "VISUAL OPERATIONS",
        description: "Find assets and maintenance activity in their physical building context.",
        model: "facility.floorplan",
        action: "facility_floorplan.action_facility_floorplan",
        icon: "fa-map-o",
        tone: "blue",
        related: ["locations", "assets", "work_orders", "meters"],
    }),
    meters: workspace({
        area: "facilities",
        title: "Asset Meters",
        eyebrow: "CONDITION MONITORING",
        description: "Track usage and readings that drive condition-based maintenance decisions.",
        model: "facility.asset.meter",
        action: "facility_asset.action_meter",
        icon: "fa-tachometer",
        tone: "slate",
        related: ["assets", "pm_plans", "work_orders", "locations"],
    }),
    failure_codes: workspace({
        area: "facilities",
        title: "Failure Knowledge",
        eyebrow: "RELIABILITY LEARNING",
        description: "Standardise problems, causes and remedies to improve maintenance learning.",
        model: "facility.failure.code",
        action: "facility_asset.action_failure_code",
        icon: "fa-warning",
        tone: "clay",
        related: ["work_orders", "assets", "job_plans", "pm_plans"],
    }),
};

export class MajalWorkspaceHub extends Component {
    static template = "construction_ui.MajalWorkspaceHub";
    static props = ["*"];

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.workspaceKey = (this.props.action?.tag || "").replace("construction_ui.workspace.", "");
        this.config = WORKSPACES[this.workspaceKey];
        this.state = useState({
            loading: true,
            metrics: [],
            recent: [],
            error: false,
        });
        this.relatedWorkspaces = (this.config.related || []).map((key) => ({
            key,
            ...WORKSPACES[key],
        }));

        onWillStart(() => this.loadWorkspace());
    }

    async loadWorkspace() {
        try {
            const fields = await this.orm.call(
                this.config.model,
                "fields_get",
                [],
                { attributes: ["type", "string"] }
            );
            const metricDefinitions = [
                { label: "Total records", hint: "Complete workspace", domain: [], icon: "fa-database" },
                {
                    label: "Added recently",
                    hint: "Last 30 days",
                    domain: [["create_date", ">=", daysAgo(30)]],
                    icon: "fa-plus-circle",
                },
                {
                    label: "Recently active",
                    hint: "Updated in 7 days",
                    domain: [["write_date", ">=", daysAgo(7)]],
                    icon: "fa-line-chart",
                },
            ];
            if (fields.active) {
                metricDefinitions.push({
                    label: "Active records",
                    hint: "Current operating set",
                    domain: [["active", "=", true]],
                    icon: "fa-check-circle",
                });
            } else if (fields.state) {
                metricDefinitions.push({
                    label: "In workflow",
                    hint: "Not closed or cancelled",
                    domain: [["state", "not in", ["done", "closed", "cancelled", "cancel"]]],
                    icon: "fa-random",
                });
            } else {
                metricDefinitions.push({
                    label: "Available now",
                    hint: "Ready to review",
                    domain: [],
                    icon: "fa-eye",
                });
            }

            const counts = await Promise.allSettled(
                metricDefinitions.map((metric) =>
                    this.orm.searchCount(
                        this.config.model,
                        [...this.config.domain, ...metric.domain]
                    )
                )
            );
            this.state.metrics = metricDefinitions.map((metric, index) => ({
                ...metric,
                value: counts[index].status === "fulfilled" ? counts[index].value : "–",
            }));
            this.state.recent = await this.orm.searchRead(
                this.config.model,
                this.config.domain,
                ["display_name", "write_date"],
                { limit: 5, order: "write_date desc" }
            );
        } catch {
            this.state.error = true;
        } finally {
            this.state.loading = false;
        }
    }

    async openMain() {
        await this.openAction(this.config.action);
    }

    async createRecord() {
        try {
            await this.action.doAction({
                type: "ir.actions.act_window",
                name: `New ${this.config.title}`,
                res_model: this.config.model,
                views: [[false, "form"]],
                target: "current",
                context: this.config.createContext,
            });
        } catch {
            this.warnUnavailable();
        }
    }

    async openRecord(recordId) {
        try {
            await this.action.doAction({
                type: "ir.actions.act_window",
                name: this.config.title,
                res_model: this.config.model,
                res_id: recordId,
                views: [[false, "form"]],
                target: "current",
            });
        } catch {
            this.warnUnavailable();
        }
    }

    async openWorkspace(key) {
        await this.openAction(`construction_ui.action_workspace_${key}`);
    }

    async goHome() {
        await this.openAction(
            this.config.area === "facilities"
                ? "construction_ui.action_facility_home"
                : "construction_ui.action_construction_home"
        );
    }

    async openAction(actionXmlId) {
        try {
            await this.action.doAction(actionXmlId);
        } catch {
            this.warnUnavailable();
        }
    }

    warnUnavailable() {
        this.notification.add(
            "This Majal workspace is not available for the current user.",
            { type: "warning" }
        );
    }

    formatDate(value) {
        if (!value) {
            return "";
        }
        return new Intl.DateTimeFormat(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
        }).format(new Date(value.replace(" ", "T") + "Z"));
    }
}

for (const key of Object.keys(WORKSPACES)) {
    registry.category("actions").add(`construction_ui.workspace.${key}`, MajalWorkspaceHub);
}
