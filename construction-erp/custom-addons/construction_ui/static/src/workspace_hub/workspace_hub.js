/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const escapeHtml = (value) =>
    String(value).replace(/[&<>"]/g, (ch) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])
    );

const daysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return `${date.toISOString().slice(0, 10)} 00:00:00`;
};

const TRANSLATABLE_CONFIG_KEYS = new Set([
    "title",
    "eyebrow",
    "description",
    "workflow",
    "label",
    "hint",
]);

const localizeConfig = (value, key = null) => {
    if (Array.isArray(value)) {
        return value.map((item) => localizeConfig(item, key));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([childKey, childValue]) => [
                childKey,
                localizeConfig(childValue, childKey),
            ])
        );
    }
    if (typeof value === "string" && TRANSLATABLE_CONFIG_KEYS.has(key)) {
        return _t(value);
    }
    return value;
};

// Per-workspace operational metrics.
//
// The generic fallbacks below ("Total records", "Added recently", ...) count
// the same rows from different angles, so on a young dataset every tile shows
// the same number and none of them tells a site or commercial team what to do
// next. These answer the operational question instead — what is open, overdue,
// waiting on me — and each tile opens the matching filtered list.
//
// `requires` lists the fields a metric depends on; if the model no longer has
// them the metric is dropped and the generic counts take over.
const OPERATIONAL_METRICS = {
    rfis: [
        { label: "Open", hint: "Not yet closed", icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "!=", "closed"]] },
        { label: "Overdue", hint: "Past the required date", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_overdue"], filter: "filter_overdue", domain: [["is_overdue", "=", true]] },
        { label: "Awaiting answer", hint: "Submitted, no response yet", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Answered", hint: "Ready to review and close", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "answered"]] },
    ],
    defects: [
        { label: "Open", hint: "Raised or reopened", icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "in", ["open", "reopened"]]] },
        { label: "In progress", hint: "Being rectified", icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: "Ready to inspect", hint: "Waiting on your sign-off", icon: "fa-search",
          requires: ["state"], domain: [["state", "=", "ready"]] },
        { label: "High severity", hint: "Critical and high risk", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["severity"], domain: [["severity", "in", ["high", "critical"]]] },
    ],
    submittals: [
        { label: "Under review", hint: "With the consultant", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Revise & resubmit", hint: "Returned for rework", icon: "fa-refresh",
          tone: "alert", requires: ["state"], domain: [["state", "=", "revise_resubmit"]] },
        { label: "Approved", hint: "Cleared for construction", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "in", ["approved", "approved_as_noted"]]] },
        { label: "Draft", hint: "Not yet issued", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
    ],
    inspections: [
        { label: "In progress", hint: "Being carried out", icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: "Awaiting approval", hint: "Submitted for review", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Rejected", hint: "Failed, needs re-inspection", icon: "fa-times-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "rejected"]] },
        { label: "Approved", hint: "Signed off", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
    ],
    progress_billing: [
        { label: "Draft", hint: "Being prepared", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Awaiting certification", hint: "Submitted to the consultant", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Certified", hint: "Ready to invoice", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "certified"]] },
        { label: "Invoiced", hint: "Awaiting payment", icon: "fa-file-text-o",
          requires: ["state"], domain: [["state", "in", ["invoiced", "paid"]]] },
    ],
    work_orders: [
        { label: "SLA breached", hint: "Missed the promised allowance", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["sla_breached"], domain: [["sla_breached", "=", true]] },
        { label: "SLA at risk", hint: "Running out of allowance", icon: "fa-clock-o",
          tone: "alert", requires: ["sla_resolution_state"],
          domain: [["sla_resolution_state", "=", "at_risk"]] },
        { label: "To triage", hint: "New, not yet scheduled", icon: "fa-inbox",
          requires: ["stage_id"], domain: [["stage_id.done", "=", false]] },
        { label: "Preventive", hint: "Planned maintenance", icon: "fa-refresh",
          requires: ["maintenance_type"], domain: [["maintenance_type", "=", "preventive"]] },
    ],
};

Object.assign(OPERATIONAL_METRICS, {
    projects: [
        { label: "In execution", hint: "On site now", icon: "fa-building-o",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "execution"]] },
        { label: "Tender & mobilization", hint: "Winning and starting up", icon: "fa-flag-o",
          requires: ["construction_stage"], domain: [["construction_stage", "in", ["tender", "mobilization"]]] },
        { label: "Handover & DLP", hint: "Closing out and under warranty", icon: "fa-key",
          requires: ["construction_stage"], domain: [["construction_stage", "in", ["handover", "dlp"]]] },
        { label: "Closed", hint: "Completed projects", icon: "fa-archive",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "closed"]] },
    ],
    // `state` (current/superseded) lives on construction.drawing.revision, not
    // on the drawing, so the register splits by discipline instead.
    drawings: [
        { label: "Architectural", hint: "Layouts and finishes", icon: "fa-building-o",
          requires: ["discipline"], domain: [["discipline", "=", "architectural"]] },
        { label: "Structural", hint: "Frame and foundations", icon: "fa-cubes",
          requires: ["discipline"], domain: [["discipline", "=", "structural"]] },
        { label: "MEP", hint: "Mechanical, electrical, plumbing", icon: "fa-bolt",
          requires: ["discipline"],
          domain: [["discipline", "in", ["mechanical", "electrical", "plumbing"]]] },
        { label: "Civil & external", hint: "Site works and landscape", icon: "fa-road",
          requires: ["discipline"], domain: [["discipline", "in", ["civil", "landscape"]]] },
    ],
    permits: [
        { label: "Live now", hint: "Work authorised right now", icon: "fa-play-circle",
          requires: ["is_live"], filter: "live", domain: [["is_live", "=", true]] },
        { label: "Awaiting approval", hint: "Cannot start yet", icon: "fa-hourglass-half",
          requires: ["state"], filter: "awaiting", domain: [["state", "=", "submitted"]] },
        { label: "Expired", hint: "Window closed, not closed out", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["state"], filter: "expired", domain: [["state", "=", "expired"]] },
        { label: "Suspended", hint: "Stopped on site", icon: "fa-pause-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "suspended"]] },
    ],
    incidents: [
        { label: "Lost time injuries", hint: "Counts towards LTIFR", icon: "fa-ambulance",
          tone: "alert", requires: ["is_lti"], filter: "lti", domain: [["is_lti", "=", true]] },
        { label: "Reportable", hint: "Notifiable to the regulator", icon: "fa-gavel",
          tone: "alert", requires: ["reportable"], filter: "reportable", domain: [["reportable", "=", true]] },
        { label: "Near misses", hint: "Free lessons — keep them coming", icon: "fa-eye",
          requires: ["incident_class"], filter: "near_miss", domain: [["incident_class", "=", "near_miss"]] },
        { label: "Open", hint: "Investigation or actions outstanding", icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "!=", "closed"]] },
    ],
    tenders: [
        { label: "In leveling", hint: "Bids in, decision pending", icon: "fa-balance-scale",
          requires: ["state"], filter: "leveling", domain: [["state", "=", "leveling"]] },
        { label: "Out to bid", hint: "Issued, awaiting prices", icon: "fa-paper-plane-o",
          requires: ["state"], domain: [["state", "=", "issued"]] },
        { label: "Awarded over budget", hint: "Committed above the estimate", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["award_saving"], domain: [["award_saving", "<", 0]] },
        { label: "Awarded", hint: "Now a subcontract commitment", icon: "fa-handshake-o",
          requires: ["state"], filter: "awarded", domain: [["state", "=", "awarded"]] },
    ],
    materials: [
        { label: "Over budget", hint: "Used more than the bill priced", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["qty_variance", "qty_budget"], filter: "over_budget",
          domain: [["qty_budget", ">", 0], ["qty_variance", ">", 0]] },
        { label: "Wasted", hint: "Products with recorded waste", icon: "fa-trash-o",
          tone: "alert", requires: ["qty_wasted"], filter: "has_waste", domain: [["qty_wasted", ">", 0]] },
        { label: "On site", hint: "Still in the site store", icon: "fa-cubes",
          requires: ["qty_on_hand"], filter: "in_store", domain: [["qty_on_hand", ">", 0]] },
        { label: "Tracked", hint: "Materials with a budget", icon: "fa-list",
          requires: ["qty_budget"], domain: [["qty_budget", ">", 0]] },
    ],
    meetings: [
        { label: "Overdue actions", hint: "Past their agreed date", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["overdue_action_count"], filter: "overdue", domain: [["overdue_action_count", ">", 0]] },
        { label: "Actions open", hint: "Minutes still carrying work", icon: "fa-folder-open-o",
          requires: ["open_action_count"], filter: "open_actions", domain: [["open_action_count", ">", 0]] },
        { label: "Minutes to issue", hint: "Held but not yet circulated", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Issued", hint: "Circulated, actions running", icon: "fa-paper-plane-o",
          requires: ["state"], domain: [["state", "=", "issued"]] },
    ],
    maintenance_contracts: [
        { label: "Losing money", hint: "Work absorbed exceeds the fee", icon: "fa-arrow-down",
          tone: "alert", requires: ["margin"], domain: [["margin", "<", 0]] },
        { label: "Due for renewal", hint: "Ends within 60 days", icon: "fa-calendar-times-o",
          tone: "alert", requires: ["days_to_expiry"], domain: [["days_to_expiry", "<=", 60]] },
        { label: "PM visits owed", hint: "Entitlement not yet delivered", icon: "fa-wrench",
          requires: ["pm_visits_remaining"], domain: [["pm_visits_remaining", ">", 0]] },
        { label: "Recoverable work", hint: "Done outside the scope of cover", icon: "fa-money",
          requires: ["chargeable_cost"], domain: [["chargeable_cost", ">", 0]] },
    ],
    bim: [
        { label: "Blocked elements", hint: "An open RFI sits on them", icon: "fa-ban",
          tone: "alert", requires: ["link_bucket"], filter: "blocked",
          domain: [["link_bucket", "=", "blocked"]] },
        { label: "Linked", hint: "Carry a record of some kind", icon: "fa-link",
          requires: ["is_linked"], filter: "linked", domain: [["is_linked", "=", true]] },
        { label: "Gone from the model", hint: "Redrawn, but still carrying records",
          icon: "fa-question-circle", tone: "alert", requires: ["is_orphan"],
          filter: "orphan", domain: [["is_orphan", "=", true]] },
        { label: "Closed out", hint: "Nothing outstanding", icon: "fa-check-circle",
          requires: ["link_bucket"], domain: [["link_bucket", "=", "done"]] },
    ],
    whatsapp: [
        { label: "Failed", hint: "Never reached the recipient", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["state"], filter: "failed",
          domain: [["state", "=", "failed"]] },
        { label: "Waiting to send", hint: "Queued for the next sweep", icon: "fa-hourglass-half",
          requires: ["state"], filter: "queued", domain: [["state", "=", "queued"]] },
        { label: "Replies", hint: "Came back from site", icon: "fa-reply",
          requires: ["direction"], filter: "incoming", domain: [["direction", "=", "in"]] },
        { label: "Delivered", hint: "Reached the phone", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "in", ["delivered", "read"]]] },
    ],
    parts: [
        { label: "Below minimum", hint: "Reorder before the next failure", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["below_reorder"], filter: "below_reorder",
          domain: [["below_reorder", "=", true]] },
        { label: "In store", hint: "Spares on the shelf", icon: "fa-cubes",
          requires: ["qty_on_hand"], filter: "in_store", domain: [["qty_on_hand", ">", 0]] },
        { label: "Consumed", hint: "Fitted to assets", icon: "fa-wrench",
          requires: ["qty_consumed"], filter: "consumed", domain: [["qty_consumed", ">", 0]] },
        { label: "Tracked", hint: "Parts with a minimum set", icon: "fa-list",
          requires: ["min_qty"], domain: [["min_qty", ">", 0]] },
    ],
    cvr: [
        { label: "Margin eroding", hint: "Forecast below the tendered margin", icon: "fa-arrow-down",
          tone: "alert", requires: ["cvr_margin_variance"], domain: [["cvr_margin_variance", "<", 0]] },
        { label: "Overcommitted", hint: "Commitments exceed the budget", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["cvr_uncommitted_budget"], domain: [["cvr_uncommitted_budget", "<", 0]] },
        { label: "In execution", hint: "Live commercial exposure", icon: "fa-building-o",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "execution"]] },
        { label: "Priced", hint: "Have an approved BOQ baseline", icon: "fa-check-circle",
          requires: ["cvr_contract_value"], domain: [["cvr_contract_value", ">", 0]] },
    ],
    programme: [
        { label: "On the critical path", hint: "Slip here slips the project", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_critical"], filter: "filter_critical", domain: [["is_critical", "=", true]] },
        { label: "Behind baseline", hint: "Finishing later than planned", icon: "fa-clock-o",
          requires: ["finish_variance_days"], filter: "filter_slipped", domain: [["finish_variance_days", ">", 0]] },
        { label: "Milestones", hint: "Contract dates to hit", icon: "fa-flag-checkered",
          requires: ["is_milestone"], filter: "filter_milestones", domain: [["is_milestone", "=", true]] },
        { label: "Complete", hint: "100% progressed", icon: "fa-check-circle",
          requires: ["progress"], domain: [["progress", ">=", 100]] },
    ],
    plan_viewer: [
        { label: "Task pins", hint: "Work dropped on a sheet", icon: "fa-wrench",
          requires: ["pin_type"], domain: [["pin_type", "=", "task"]] },
        { label: "RFI pins", hint: "Questions raised on a sheet", icon: "fa-question",
          requires: ["pin_type"], domain: [["pin_type", "=", "rfi"]] },
        { label: "Defect pins", hint: "Snags located on a sheet", icon: "fa-exclamation-triangle",
          requires: ["pin_type"], domain: [["pin_type", "=", "defect"]] },
        { label: "Notes", hint: "Field annotations", icon: "fa-sticky-note",
          requires: ["pin_type"], domain: [["pin_type", "=", "note"]] },
    ],
    boq: [
        { label: "Draft", hint: "Still being priced", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Approved", hint: "Agreed, open for variation", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
        { label: "Locked", hint: "Frozen baseline", icon: "fa-lock",
          requires: ["state"], domain: [["state", "=", "locked"]] },
    ],
    change_orders: [
        { label: "Draft", hint: "Being priced", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Awaiting approval", hint: "Submitted to the client", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Approved", hint: "Added to the contract", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
        { label: "Rejected", hint: "Not recoverable", icon: "fa-times-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "rejected"]] },
    ],
    subcontracts: [
        { label: "Draft", hint: "Not yet awarded", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Live", hint: "Awarded and running", icon: "fa-handshake-o",
          requires: ["state"], domain: [["state", "=", "confirmed"]] },
        { label: "Closed", hint: "Completed packages", icon: "fa-archive",
          requires: ["state"], domain: [["state", "=", "closed"]] },
    ],
    daily_logs: [
        { label: "Draft", hint: "Not yet submitted", icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: "Submitted", hint: "Awaiting sign-off", icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: "Approved", hint: "Signed off", icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
    ],
    assets: [
        { label: "Critical & high", hint: "Failure hurts most", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["criticality"], domain: [["criticality", "in", ["high", "critical"]]] },
        { label: "Under warranty", hint: "Repairs may be recoverable", icon: "fa-shield",
          requires: ["warranty_active"], domain: [["warranty_active", "=", true]] },
        { label: "Out of warranty", hint: "Repairs are your cost", icon: "fa-money",
          requires: ["warranty_active"], domain: [["warranty_active", "=", false]] },
    ],
    pm_plans: [
        { label: "Calendar-driven", hint: "Time-based schedules", icon: "fa-calendar",
          requires: ["trigger_type"], domain: [["trigger_type", "=", "calendar"]] },
        { label: "Meter-driven", hint: "Usage-based schedules", icon: "fa-tachometer",
          requires: ["trigger_type"], domain: [["trigger_type", "=", "meter"]] },
        { label: "Paused", hint: "Archived, not generating", icon: "fa-pause-circle",
          requires: ["active"], domain: [["active", "=", false]] },
    ],
});

// Hubs that surface the same model share its metrics.
OPERATIONAL_METRICS.quality_hub = OPERATIONAL_METRICS.defects;
OPERATIONAL_METRICS.site_work = OPERATIONAL_METRICS.inspections;
OPERATIONAL_METRICS.engineering_hub = OPERATIONAL_METRICS.drawings;

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
        related: ["cvr", "boq", "change_orders", "progress_billing", "subcontracts"],
    }),
    permits: workspace({
        title: "Permits to Work",
        eyebrow: "HIGH-RISK CONTROL",
        description: "Authorise high-risk activity for a stated window, once its precautions are confirmed.",
        model: "construction.permit",
        action: "construction_hse.action_permit",
        icon: "fa-file-text-o",
        tone: "amber",
        workflow: [
            ["Request", "Describe the work, the window and the precautions."],
            ["Approve", "A competent person confirms controls and signs."],
            ["Close", "Hand the area back and close the permit out."],
        ],
        related: ["incidents", "toolbox_talks", "defects"],
    }),
    incidents: workspace({
        title: "Incidents & Near Misses",
        eyebrow: "SAFETY LEARNING",
        description: "Record what happened, find why, and close the actions that stop it happening again.",
        model: "construction.incident",
        action: "construction_hse.action_incident",
        icon: "fa-exclamation-triangle",
        tone: "coral",
        workflow: [
            ["Report", "Capture the event while the detail is fresh."],
            ["Investigate", "Establish the root cause, not the culprit."],
            ["Act", "Close the corrective actions and the loop."],
        ],
        related: ["permits", "toolbox_talks", "defects"],
    }),
    toolbox_talks: workspace({
        title: "Toolbox Talks",
        eyebrow: "SITE BRIEFING",
        description: "Pre-start safety briefings with the attendance record that proves they happened.",
        model: "construction.toolbox.talk",
        action: "construction_hse.action_toolbox_talk",
        icon: "fa-users",
        tone: "teal",
        workflow: [
            ["Brief", "Cover the topic with the crew before work starts."],
            ["Record", "Capture who attended, signed on site."],
            ["Reuse", "Feed incident lessons into the next talk."],
        ],
        related: ["incidents", "permits", "daily_logs"],
    }),
    tenders: workspace({
        title: "Tender Packages",
        eyebrow: "PROCUREMENT",
        description: "Price a scope with several subcontractors against identical lines, then award straight into a subcontract.",
        model: "construction.tender",
        action: "construction_tender.action_tender",
        icon: "fa-gavel",
        tone: "amber",
        workflow: [
            ["Package", "Take the scope from the BOQ so budget travels with it."],
            ["Level", "Compare line by line — totals hide unpriced scope."],
            ["Award", "Turn the winning price into a subcontract commitment."],
        ],
        related: ["subcontracts", "boq", "cvr"],
    }),
    materials: workspace({
        title: "Materials & Site Stores",
        eyebrow: "SITE INVENTORY",
        description: "What was priced, what went into the works, what was lost, and what is still in the store.",
        model: "construction.material.summary",
        action: "construction_material.action_material_summary",
        icon: "fa-cubes",
        tone: "amber",
        allowCreate: false,
        workflow: [
            ["Receive", "Deliveries land in the project's site store."],
            ["Issue", "Materials leave the store against a BOQ item."],
            ["Reconcile", "Consumption and waste against the priced quantity."],
        ],
        related: ["boq", "daily_logs", "cvr"],
    }),
    cvr: workspace({
        title: "Cost Value Reconciliation",
        eyebrow: "COMMERCIAL POSITION",
        description: "Value certified against cost incurred, so margin erosion surfaces while there is still time to act.",
        model: "project.project",
        action: "construction_report.action_project_cvr",
        icon: "fa-balance-scale",
        tone: "navy",
        allowCreate: false,
        domain: [["is_construction", "=", true]],
        workflow: [
            ["Baseline", "Approve the BOQ: contract value and target cost."],
            ["Commit", "Award subcontracts and certify progress both ways."],
            ["Reconcile", "Compare earned margin with the margin tendered."],
        ],
        related: ["boq", "progress_billing", "subcontracts", "change_orders"],
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
    meetings: workspace({
        title: "Meetings & Minutes",
        eyebrow: "SITE COORDINATION",
        description: "Minutes whose actions carry forward on their own, so the item nobody is doing cannot quietly disappear.",
        model: "construction.meeting",
        action: "construction_meeting.action_meeting",
        icon: "fa-comments-o",
        tone: "navy",
        workflow: [
            ["Meet", "Record attendance, discussion and the actions agreed."],
            ["Issue", "Circulate the minutes with owners and dates."],
            ["Carry", "Open actions move to the next meeting, keeping their age."],
        ],
        related: ["rfis", "programme", "defects"],
    }),
    maintenance_contracts: workspace({
        area: "facilities",
        title: "Maintenance Contracts",
        eyebrow: "CONTRACT MARGIN",
        description: "What each contract covers, what it promised, and whether the work under it still costs less than the fee.",
        model: "contract.contract",
        action: "facility_contract.action_facility_contract",
        icon: "fa-file-text-o",
        tone: "blue",
        // contract.contract also holds ordinary sale and purchase contracts,
        // so the whole workspace — tiles, recent list and create — is scoped
        // to the maintenance ones.
        domain: [["is_amc", "=", true]],
        createContext: { default_is_amc: true, default_contract_type: "sale" },
        workflow: [
            ["Cover", "Name the assets, the scope and the SLA that was sold."],
            ["Deliver", "Work orders match themselves to the contract."],
            ["Reconcile", "Fee against absorbed cost, with recoverable work separated."],
        ],
        related: ["work_orders", "assets", "pm_plans"],
    }),
    bim: workspace({
        title: "BIM Models",
        eyebrow: "MODEL COORDINATION",
        description: "Questions attached to the wall they are about, surviving every re-issue of the model.",
        model: "construction.bim.element",
        action: "construction_bim.action_bim_element",
        icon: "fa-cube",
        tone: "navy",
        allowCreate: false,
        workflow: [
            ["Index", "Read the elements out of the IFC file."],
            ["Link", "Attach RFIs, defects, tasks and bill items to elements."],
            ["Re-issue", "GlobalIds are stable, so the links survive the next export."],
        ],
        related: ["rfis", "defects", "drawings", "boq"],
    }),
    whatsapp: workspace({
        title: "WhatsApp Alerts",
        eyebrow: "REACHING SITE",
        description: "The channel site and facilities staff actually read, carrying the alerts that already exist.",
        model: "whatsapp.message",
        action: "construction_whatsapp.action_whatsapp_message",
        icon: "fa-whatsapp",
        tone: "teal",
        allowCreate: false,
        workflow: [
            ["Trigger", "An event queues the message — nothing is sent by hand."],
            ["Send", "A cron clears the queue, so no save waits on Meta."],
            ["Reply", "Answers come back onto the document they were about."],
        ],
        related: ["permits", "rfis", "defects"],
    }),
    parts: workspace({
        area: "facilities",
        title: "Parts & Stores",
        eyebrow: "SPARES CONTROL",
        description: "What each store holds, what work orders have consumed, and what to buy before the next failure.",
        model: "facility.parts.summary",
        action: "facility_inventory.action_parts_summary",
        icon: "fa-cubes",
        tone: "sand",
        allowCreate: false,
        workflow: [
            ["Hold", "Spares sit in a store attached to a building."],
            ["Consume", "A work order takes them out, and cost follows the stock."],
            ["Reorder", "The minimum on the asset's spare list finally bites."],
        ],
        related: ["work_orders", "assets", "maintenance_contracts"],
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
        this.config = localizeConfig(WORKSPACES[this.workspaceKey]);
        this.suiteTitle =
            this.config.area === "facilities" ? _t("Majal Facilities") : _t("Majal Construction");
        this.suiteArea =
            this.config.area === "facilities" ? _t("Facilities") : _t("Construction");
        this.state = useState({
            loading: true,
            metrics: [],
            recent: [],
            error: false,
        });
        this.relatedWorkspaces = (this.config.related || []).map((key) => ({
            key,
            ...localizeConfig(WORKSPACES[key]),
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
            // Workspace-specific metrics answer "what needs me now?". They are
            // only used when every field they reference actually exists, so a
            // model change degrades to the generic counts instead of erroring.
            const tailored = (OPERATIONAL_METRICS[this.workspaceKey] || []).filter((metric) =>
                (metric.requires || []).every((fieldName) => fieldName in fields)
            );
            if (tailored.length) {
                await this.applyMetrics(tailored.map((metric) => ({ ...metric, label: _t(metric.label), hint: _t(metric.hint) })));
                await this.loadRecent();
                return;
            }
            const metricDefinitions = [
                { label: _t("Total records"), hint: _t("Complete workspace"), domain: [], icon: "fa-database" },
                {
                    label: _t("Added recently"),
                    hint: _t("Last 30 days"),
                    domain: [["create_date", ">=", daysAgo(30)]],
                    icon: "fa-plus-circle",
                },
                {
                    label: _t("Recently active"),
                    hint: _t("Updated in 7 days"),
                    domain: [["write_date", ">=", daysAgo(7)]],
                    icon: "fa-line-chart",
                },
            ];
            if (fields.active) {
                metricDefinitions.push({
                    label: _t("Active records"),
                    hint: _t("Current operating set"),
                    domain: [["active", "=", true]],
                    icon: "fa-check-circle",
                });
            } else if (fields.state) {
                metricDefinitions.push({
                    label: _t("In workflow"),
                    hint: _t("Not closed or cancelled"),
                    domain: [["state", "not in", ["done", "closed", "cancelled", "cancel"]]],
                    icon: "fa-random",
                });
            } else {
                metricDefinitions.push({
                    label: _t("Available now"),
                    hint: _t("Ready to review"),
                    domain: [],
                    icon: "fa-eye",
                });
            }

            await this.applyMetrics(metricDefinitions);
            await this.loadRecent();
        } catch {
            this.state.error = true;
        } finally {
            this.state.loading = false;
        }
    }

    /** Count each metric and keep the definition so tiles stay clickable. */
    async applyMetrics(metricDefinitions) {
        const counts = await Promise.allSettled(
            metricDefinitions.map((metric) =>
                this.orm.searchCount(this.config.model, [
                    ...this.config.domain,
                    ...metric.domain,
                ])
            )
        );
        this.state.metrics = metricDefinitions.map((metric, index) => ({
            ...metric,
            value: counts[index].status === "fulfilled" ? counts[index].value : "–",
        }));
    }

    async loadRecent() {
        this.state.recent = await this.orm.searchRead(
            this.config.model,
            this.config.domain,
            ["display_name", "write_date"],
            { limit: 5, order: "write_date desc" }
        );
    }

    /** Open the workspace list already filtered to the metric that was clicked.
     *
     * Where the module's own search view has a filter with the same meaning,
     * the tile opens that action and switches the filter on. That matters more
     * than it sounds: the user lands with a removable facet in the search bar,
     * so the list says why it is filtered and can be widened in one click,
     * and they keep the module's filters, group-bys and saved searches.
     *
     * A raw domain, by contrast, is invisible and cannot be undone without
     * navigating away — which is what the tiles used to do.
     */
    async openMetric(metric) {
        if (metric.filter) {
            try {
                await this.action.doAction(this.config.action, {
                    additionalContext: { [`search_default_${metric.filter}`]: 1 },
                });
                return;
            } catch {
                // Fall through to the self-contained list below.
            }
        }
        try {
            await this.action.doAction({
                type: "ir.actions.act_window",
                name: `${this.config.title} — ${metric.label}`,
                res_model: this.config.model,
                domain: [...this.config.domain, ...metric.domain],
                views: [[false, "list"], [false, "form"]],
                target: "current",
                context: this.config.createContext,
                // Without this a count of zero opens an empty grid with no
                // explanation, which reads as a broken screen rather than as
                // good news.
                help: `<p class="o_view_nocontent_smiling_face">${escapeHtml(
                    _t("Nothing here — %s is at zero.", metric.label)
                )}</p><p>${escapeHtml(metric.hint)}</p>`,
            });
        } catch {
            this.warnUnavailable();
        }
    }

    async openMain() {
        await this.openAction(this.config.action);
    }

    /** Start a new record through the module's own action.
     *
     * Going through the action rather than opening a bare form means the
     * defaults the module sets in its action context actually apply, so the
     * form opens partly filled instead of as a wall of required fields.
     */
    async createRecord() {
        try {
            await this.action.doAction(this.config.action, {
                additionalContext: this.config.createContext,
                viewType: "form",
            });
            return;
        } catch {
            // Fall through — a workspace can point at an action that does not
            // offer a form view.
        }
        try {
            await this.action.doAction({
                type: "ir.actions.act_window",
                name: _t("New %s", this.config.title),
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
            _t("This Majal workspace is not available for the current user."),
            { type: "warning" }
        );
    }

    formatDate(value) {
        if (!value) {
            return "";
        }
        return new Intl.DateTimeFormat(
            document.body.classList.contains("o_rtl") ? "ar-AE" : undefined,
            {
                day: "numeric",
                month: "short",
                year: "numeric",
                numberingSystem: document.body.classList.contains("o_rtl") ? "arab" : undefined,
            }
        ).format(new Date(value.replace(" ", "T") + "Z"));
    }
}

for (const key of Object.keys(WORKSPACES)) {
    registry.category("actions").add(`construction_ui.workspace.${key}`, MajalWorkspaceHub);
}
