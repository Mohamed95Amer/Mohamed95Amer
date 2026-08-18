/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
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
    // A LazyTranslatedString extends String, so `typeof` calls it an
    // object; walking into it turns the text into a map of character
    // indices and renders as "[object Object]".
    if (value instanceof String) {
        return value;
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
// Exported so a downstream suite (Property) can register its own tiles with
// Object.assign rather than this file growing an entry per app.
export const OPERATIONAL_METRICS = {
    rfis: [
        { label: _t("Open"), hint: _t("Not yet closed"), icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "!=", "closed"]] },
        { label: _t("Overdue"), hint: _t("Past the required date"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_overdue"], filter: "filter_overdue", domain: [["is_overdue", "=", true]] },
        { label: _t("Awaiting answer"), hint: _t("Submitted, no response yet"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Answered"), hint: _t("Ready to review and close"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "answered"]] },
    ],
    defects: [
        { label: _t("Open"), hint: _t("Raised or reopened"), icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "in", ["open", "reopened"]]] },
        { label: _t("In progress"), hint: _t("Being rectified"), icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: _t("Ready to inspect"), hint: _t("Waiting on your sign-off"), icon: "fa-search",
          requires: ["state"], domain: [["state", "=", "ready"]] },
        { label: _t("High severity"), hint: _t("Critical and high risk"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["severity"], domain: [["severity", "in", ["high", "critical"]]] },
    ],
    submittals: [
        { label: _t("Under review"), hint: _t("With the consultant"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Revise & resubmit"), hint: _t("Returned for rework"), icon: "fa-refresh",
          tone: "alert", requires: ["state"], domain: [["state", "=", "revise_resubmit"]] },
        { label: _t("Approved"), hint: _t("Cleared for construction"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "in", ["approved", "approved_as_noted"]]] },
        { label: _t("Draft"), hint: _t("Not yet issued"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
    ],
    inspections: [
        { label: _t("In progress"), hint: _t("Being carried out"), icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: _t("Awaiting approval"), hint: _t("Submitted for review"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Rejected"), hint: _t("Failed, needs re-inspection"), icon: "fa-times-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "rejected"]] },
        { label: _t("Approved"), hint: _t("Signed off"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
    ],
    progress_billing: [
        { label: _t("Draft"), hint: _t("Being prepared"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Awaiting certification"), hint: _t("Submitted to the consultant"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Certified"), hint: _t("Ready to invoice"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "certified"]] },
        { label: _t("Invoiced"), hint: _t("Awaiting payment"), icon: "fa-file-text-o",
          requires: ["state"], domain: [["state", "in", ["invoiced", "paid"]]] },
    ],
    work_orders: [
        { label: _t("SLA breached"), hint: _t("Missed the promised allowance"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["sla_breached"], domain: [["sla_breached", "=", true]] },
        { label: _t("SLA at risk"), hint: _t("Running out of allowance"), icon: "fa-clock-o",
          tone: "alert", requires: ["sla_resolution_state"],
          domain: [["sla_resolution_state", "=", "at_risk"]] },
        { label: _t("To triage"), hint: _t("New, not yet scheduled"), icon: "fa-inbox",
          requires: ["stage_id"], domain: [["stage_id.done", "=", false]] },
        { label: _t("Preventive"), hint: _t("Planned maintenance"), icon: "fa-refresh",
          requires: ["maintenance_type"], domain: [["maintenance_type", "=", "preventive"]] },
    ],
};

Object.assign(OPERATIONAL_METRICS, {
    projects: [
        { label: _t("In execution"), hint: _t("On site now"), icon: "fa-building-o",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "execution"]] },
        { label: _t("Tender & mobilization"), hint: _t("Winning and starting up"), icon: "fa-flag-o",
          requires: ["construction_stage"], domain: [["construction_stage", "in", ["tender", "mobilization"]]] },
        { label: _t("Handover & DLP"), hint: _t("Closing out and under warranty"), icon: "fa-key",
          requires: ["construction_stage"], domain: [["construction_stage", "in", ["handover", "dlp"]]] },
        { label: _t("Closed"), hint: _t("Completed projects"), icon: "fa-archive",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "closed"]] },
    ],
    // `state` (current/superseded) lives on construction.drawing.revision, not
    // on the drawing, so the register splits by discipline instead.
    drawings: [
        { label: _t("Architectural"), hint: _t("Layouts and finishes"), icon: "fa-building-o",
          requires: ["discipline"], domain: [["discipline", "=", "architectural"]] },
        { label: _t("Structural"), hint: _t("Frame and foundations"), icon: "fa-cubes",
          requires: ["discipline"], domain: [["discipline", "=", "structural"]] },
        { label: _t("MEP"), hint: _t("Mechanical, electrical, plumbing"), icon: "fa-bolt",
          requires: ["discipline"],
          domain: [["discipline", "in", ["mechanical", "electrical", "plumbing"]]] },
        { label: _t("Civil & external"), hint: _t("Site works and landscape"), icon: "fa-road",
          requires: ["discipline"], domain: [["discipline", "in", ["civil", "landscape"]]] },
    ],
    permits: [
        { label: _t("Live now"), hint: _t("Work authorised right now"), icon: "fa-play-circle",
          requires: ["is_live"], filter: "live", domain: [["is_live", "=", true]] },
        { label: _t("Awaiting approval"), hint: _t("Cannot start yet"), icon: "fa-hourglass-half",
          requires: ["state"], filter: "awaiting", domain: [["state", "=", "submitted"]] },
        { label: _t("Expired"), hint: _t("Window closed, not closed out"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["state"], filter: "expired", domain: [["state", "=", "expired"]] },
        { label: _t("Suspended"), hint: _t("Stopped on site"), icon: "fa-pause-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "suspended"]] },
    ],
    incidents: [
        { label: _t("Lost time injuries"), hint: _t("Counts towards LTIFR"), icon: "fa-ambulance",
          tone: "alert", requires: ["is_lti"], filter: "lti", domain: [["is_lti", "=", true]] },
        { label: _t("Reportable"), hint: _t("Notifiable to the regulator"), icon: "fa-gavel",
          tone: "alert", requires: ["reportable"], filter: "reportable", domain: [["reportable", "=", true]] },
        { label: _t("Near misses"), hint: _t("Free lessons — keep them coming"), icon: "fa-eye",
          requires: ["incident_class"], filter: "near_miss", domain: [["incident_class", "=", "near_miss"]] },
        { label: _t("Open"), hint: _t("Investigation or actions outstanding"), icon: "fa-folder-open-o",
          requires: ["state"], domain: [["state", "!=", "closed"]] },
    ],
    tenders: [
        { label: _t("In leveling"), hint: _t("Bids in, decision pending"), icon: "fa-balance-scale",
          requires: ["state"], filter: "leveling", domain: [["state", "=", "leveling"]] },
        { label: _t("Out to bid"), hint: _t("Issued, awaiting prices"), icon: "fa-paper-plane-o",
          requires: ["state"], domain: [["state", "=", "issued"]] },
        { label: _t("Awarded over budget"), hint: _t("Committed above the estimate"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["award_saving"], domain: [["award_saving", "<", 0]] },
        { label: _t("Awarded"), hint: _t("Now a subcontract commitment"), icon: "fa-handshake-o",
          requires: ["state"], filter: "awarded", domain: [["state", "=", "awarded"]] },
    ],
    materials: [
        { label: _t("Over budget"), hint: _t("Used more than the bill priced"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["qty_variance", "qty_budget"], filter: "over_budget",
          domain: [["qty_budget", ">", 0], ["qty_variance", ">", 0]] },
        { label: _t("Wasted"), hint: _t("Products with recorded waste"), icon: "fa-trash-o",
          tone: "alert", requires: ["qty_wasted"], filter: "has_waste", domain: [["qty_wasted", ">", 0]] },
        { label: _t("On site"), hint: _t("Still in the site store"), icon: "fa-cubes",
          requires: ["qty_on_hand"], filter: "in_store", domain: [["qty_on_hand", ">", 0]] },
        { label: _t("Tracked"), hint: _t("Materials with a budget"), icon: "fa-list",
          requires: ["qty_budget"], domain: [["qty_budget", ">", 0]] },
    ],
    meetings: [
        { label: _t("Overdue actions"), hint: _t("Past their agreed date"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["overdue_action_count"], filter: "overdue", domain: [["overdue_action_count", ">", 0]] },
        { label: _t("Actions open"), hint: _t("Minutes still carrying work"), icon: "fa-folder-open-o",
          requires: ["open_action_count"], filter: "open_actions", domain: [["open_action_count", ">", 0]] },
        { label: _t("Minutes to issue"), hint: _t("Held but not yet circulated"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Issued"), hint: _t("Circulated, actions running"), icon: "fa-paper-plane-o",
          requires: ["state"], domain: [["state", "=", "issued"]] },
    ],
    maintenance_contracts: [
        { label: _t("Losing money"), hint: _t("Work absorbed exceeds the fee"), icon: "fa-arrow-down",
          tone: "alert", requires: ["margin"], domain: [["margin", "<", 0]] },
        { label: _t("Due for renewal"), hint: _t("Ends within 60 days"), icon: "fa-calendar-times-o",
          tone: "alert", requires: ["days_to_expiry"], domain: [["days_to_expiry", "<=", 60]] },
        { label: _t("PM visits owed"), hint: _t("Entitlement not yet delivered"), icon: "fa-wrench",
          requires: ["pm_visits_remaining"], domain: [["pm_visits_remaining", ">", 0]] },
        { label: _t("Recoverable work"), hint: _t("Done outside the scope of cover"), icon: "fa-money",
          requires: ["chargeable_cost"], domain: [["chargeable_cost", ">", 0]] },
    ],
    bim: [
        { label: _t("Blocked elements"), hint: _t("An open RFI sits on them"), icon: "fa-ban",
          tone: "alert", requires: ["link_bucket"], filter: "blocked",
          domain: [["link_bucket", "=", "blocked"]] },
        { label: _t("Linked"), hint: _t("Carry a record of some kind"), icon: "fa-link",
          requires: ["is_linked"], filter: "linked", domain: [["is_linked", "=", true]] },
        { label: _t("Gone from the model"), hint: _t("Redrawn, but still carrying records"),
          icon: "fa-question-circle", tone: "alert", requires: ["is_orphan"],
          filter: "orphan", domain: [["is_orphan", "=", true]] },
        { label: _t("Closed out"), hint: _t("Nothing outstanding"), icon: "fa-check-circle",
          requires: ["link_bucket"], domain: [["link_bucket", "=", "done"]] },
    ],
    parts: [
        { label: _t("Below minimum"), hint: _t("Reorder before the next failure"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["below_reorder"], filter: "below_reorder",
          domain: [["below_reorder", "=", true]] },
        { label: _t("In store"), hint: _t("Spares on the shelf"), icon: "fa-cubes",
          requires: ["qty_on_hand"], filter: "in_store", domain: [["qty_on_hand", ">", 0]] },
        { label: _t("Consumed"), hint: _t("Fitted to assets"), icon: "fa-wrench",
          requires: ["qty_consumed"], filter: "consumed", domain: [["qty_consumed", ">", 0]] },
        { label: _t("Tracked"), hint: _t("Parts with a minimum set"), icon: "fa-list",
          requires: ["min_qty"], domain: [["min_qty", ">", 0]] },
    ],
    cvr: [
        { label: _t("Margin eroding"), hint: _t("Forecast below the tendered margin"), icon: "fa-arrow-down",
          tone: "alert", requires: ["cvr_margin_variance"], domain: [["cvr_margin_variance", "<", 0]] },
        { label: _t("Overcommitted"), hint: _t("Commitments exceed the budget"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["cvr_uncommitted_budget"], domain: [["cvr_uncommitted_budget", "<", 0]] },
        { label: _t("In execution"), hint: _t("Live commercial exposure"), icon: "fa-building-o",
          requires: ["construction_stage"], domain: [["construction_stage", "=", "execution"]] },
        { label: _t("Priced"), hint: _t("Have an approved BOQ baseline"), icon: "fa-check-circle",
          requires: ["cvr_contract_value"], domain: [["cvr_contract_value", ">", 0]] },
    ],
    programme: [
        { label: _t("On the critical path"), hint: _t("Slip here slips the project"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_critical"], filter: "filter_critical", domain: [["is_critical", "=", true]] },
        { label: _t("Behind baseline"), hint: _t("Finishing later than planned"), icon: "fa-clock-o",
          requires: ["finish_variance_days"], filter: "filter_slipped", domain: [["finish_variance_days", ">", 0]] },
        { label: _t("Milestones"), hint: _t("Contract dates to hit"), icon: "fa-flag-checkered",
          requires: ["is_milestone"], filter: "filter_milestones", domain: [["is_milestone", "=", true]] },
        { label: _t("Complete"), hint: _t("100% progressed"), icon: "fa-check-circle",
          requires: ["progress"], domain: [["progress", ">=", 100]] },
    ],
    boq: [
        { label: _t("Draft"), hint: _t("Still being priced"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Approved"), hint: _t("Agreed, open for variation"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
        { label: _t("Locked"), hint: _t("Frozen baseline"), icon: "fa-lock",
          requires: ["state"], domain: [["state", "=", "locked"]] },
    ],
    change_orders: [
        { label: _t("Draft"), hint: _t("Being priced"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Awaiting approval"), hint: _t("Submitted to the client"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Approved"), hint: _t("Added to the contract"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
        { label: _t("Rejected"), hint: _t("Not recoverable"), icon: "fa-times-circle",
          tone: "alert", requires: ["state"], domain: [["state", "=", "rejected"]] },
    ],
    subcontracts: [
        { label: _t("Draft"), hint: _t("Not yet awarded"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Live"), hint: _t("Awarded and running"), icon: "fa-handshake-o",
          requires: ["state"], domain: [["state", "=", "confirmed"]] },
        { label: _t("Closed"), hint: _t("Completed packages"), icon: "fa-archive",
          requires: ["state"], domain: [["state", "=", "closed"]] },
    ],
    daily_logs: [
        { label: _t("Draft"), hint: _t("Not yet submitted"), icon: "fa-pencil",
          requires: ["state"], domain: [["state", "=", "draft"]] },
        { label: _t("Submitted"), hint: _t("Awaiting sign-off"), icon: "fa-hourglass-half",
          requires: ["state"], domain: [["state", "=", "submitted"]] },
        { label: _t("Approved"), hint: _t("Signed off"), icon: "fa-check-circle",
          requires: ["state"], domain: [["state", "=", "approved"]] },
    ],
    assets: [
        { label: _t("Critical & high"), hint: _t("Failure hurts most"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["criticality"], domain: [["criticality", "in", ["high", "critical"]]] },
        { label: _t("Under warranty"), hint: _t("Repairs may be recoverable"), icon: "fa-shield",
          requires: ["warranty_active"], domain: [["warranty_active", "=", true]] },
        { label: _t("Out of warranty"), hint: _t("Repairs are your cost"), icon: "fa-money",
          requires: ["warranty_active"], domain: [["warranty_active", "=", false]] },
    ],
    pm_plans: [
        { label: _t("Calendar-driven"), hint: _t("Time-based schedules"), icon: "fa-calendar",
          requires: ["trigger_type"], domain: [["trigger_type", "=", "calendar"]] },
        { label: _t("Meter-driven"), hint: _t("Usage-based schedules"), icon: "fa-tachometer",
          requires: ["trigger_type"], domain: [["trigger_type", "=", "meter"]] },
        { label: _t("Paused"), hint: _t("Archived, not generating"), icon: "fa-pause-circle",
          requires: ["active"], domain: [["active", "=", false]] },
    ],
});

// Hubs that surface the same model share its metrics.
OPERATIONAL_METRICS.quality_hub = OPERATIONAL_METRICS.defects;
OPERATIONAL_METRICS.site_work = OPERATIONAL_METRICS.inspections;
OPERATIONAL_METRICS.engineering_hub = OPERATIONAL_METRICS.drawings;

// One entry per suite the workspaces belong to. A lookup rather than a chain
// of ternaries so the next app that joins the platform registers itself here
// instead of editing three separate expressions in this file.
// Strings are plain English and translated at setup, matching localizeConfig.
export const AREAS = {
    construction: {
        suiteTitle: "Majal Construction",
        suiteArea: "Construction",
        home: "construction_ui.action_construction_home",
    },
    facilities: {
        suiteTitle: "Majal Facilities",
        suiteArea: "Facilities",
        home: "construction_ui.action_facility_home",
    },
};

const workspace = (values) => ({
    area: "construction",
    tone: "blue",
    allowCreate: true,
    domain: [],
    createContext: {},
    workflow: [
        [_t("Capture"), _t("Create and classify the operational record.")],
        [_t("Coordinate"), _t("Assign ownership and move the work forward.")],
        [_t("Close"), _t("Complete the record with a clear audit trail.")],
    ],
    related: [],
    ...values,
});

export const WORKSPACES = {
    projects: workspace({
        title: _t("Project Portfolio"),
        eyebrow: _t("PORTFOLIO CONTROL"),
        description: _t("A single view of active projects, delivery activity and recently updated project records."),
        model: "project.project",
        action: "construction_base.action_construction_projects",
        icon: "fa-building-o",
        tone: "navy",
        domain: [["is_construction", "=", true]],
        createContext: { default_is_construction: true },
        workflow: [
            [_t("Mobilise"), _t("Set the project team, dates and commercial baseline.")],
            [_t("Deliver"), _t("Coordinate engineering, site and commercial workstreams.")],
            [_t("Handover"), _t("Close delivery and transition assets into operations.")],
        ],
        related: ["programme", "drawings", "boq", "daily_logs"],
    }),
    site_work: workspace({
        title: _t("Site Work Control"),
        eyebrow: _t("ON-SITE DELIVERY"),
        description: _t("A project-aware landing page for daily records, structured forms, inspections, quantities and field observations."),
        model: "construction.form.inspection",
        action: "construction_form.action_form_inspections",
        icon: "fa-hard-hat",
        tone: "sand",
        workflow: [
            [_t("Plan"), _t("Select the project, location, form and responsible field team.")],
            [_t("Capture"), _t("Record quantities, checks, photos, signatures and daily evidence.")],
            [_t("Coordinate"), _t("Route exceptions into defects, RFIs or technical approvals.")],
        ],
        related: ["daily_logs", "inspections", "boq"],
    }),
    quality_hub: workspace({
        title: _t("Quality & QA"),
        eyebrow: _t("ASSURANCE & CLOSE-OUT"),
        description: _t("Control inspections, quality assurance forms, snags, observations and technical submittals from one place."),
        model: "construction.defect",
        action: "construction_defect.action_construction_defect",
        icon: "fa-shield",
        tone: "teal",
        workflow: [
            [_t("Inspect"), _t("Run the planned check and capture objective field evidence.")],
            [_t("Resolve"), _t("Assign observations and verify corrective action.")],
            [_t("Approve"), _t("Close the record with a traceable decision and sign-off.")],
        ],
        related: ["inspections", "defects", "submittals", "drawings"],
    }),
    engineering_hub: workspace({
        title: _t("Engineering & Information"),
        eyebrow: _t("DESIGN COORDINATION"),
        description: _t("Coordinate drawings, revisions, RFIs and submittals with a controlled approval trail."),
        model: "construction.drawing",
        action: "construction_drawing.action_construction_drawing",
        icon: "fa-sitemap",
        tone: "violet",
        allowCreate: false,
        workflow: [
            [_t("Register"), _t("Structure the drawing and information registers by project.")],
            [_t("Review"), _t("Coordinate RFIs, submittals and drawing revision comments.")],
            [_t("Release"), _t("Sign off and publish the approved information set.")],
        ],
        related: ["drawings", "rfis", "submittals"],
    }),
    commercial_hub: workspace({
        title: _t("Commercial Control"),
        eyebrow: _t("COST & CONTRACT"),
        description: _t("Connect tender documents, quotations, sales orders, BOQs, change and payment control."),
        model: "majal.project.document",
        action: "construction_ui.action_majal_project_documents",
        icon: "fa-line-chart",
        tone: "navy",
        allowCreate: false,
        workflow: [
            [_t("Baseline"), _t("Capture tender, contract, quantities, costs and target margin.")],
            [_t("Control"), _t("Evaluate changes, commitments and measured progress.")],
            [_t("Certify"), _t("Approve commercial documents and payment outcomes.")],
        ],
        related: ["cvr", "boq", "change_orders", "progress_billing", "subcontracts"],
    }),
    permits: workspace({
        title: _t("Permits to Work"),
        eyebrow: _t("HIGH-RISK CONTROL"),
        description: _t("Authorise high-risk activity for a stated window, once its precautions are confirmed."),
        model: "construction.permit",
        action: "construction_hse.action_permit",
        icon: "fa-file-text-o",
        tone: "amber",
        workflow: [
            [_t("Request"), _t("Describe the work, the window and the precautions.")],
            [_t("Approve"), _t("A competent person confirms controls and signs.")],
            [_t("Close"), _t("Hand the area back and close the permit out.")],
        ],
        related: ["incidents", "toolbox_talks", "defects"],
    }),
    incidents: workspace({
        title: _t("Incidents & Near Misses"),
        eyebrow: _t("SAFETY LEARNING"),
        description: _t("Record what happened, find why, and close the actions that stop it happening again."),
        model: "construction.incident",
        action: "construction_hse.action_incident",
        icon: "fa-exclamation-triangle",
        tone: "coral",
        workflow: [
            [_t("Report"), _t("Capture the event while the detail is fresh.")],
            [_t("Investigate"), _t("Establish the root cause, not the culprit.")],
            [_t("Act"), _t("Close the corrective actions and the loop.")],
        ],
        related: ["permits", "toolbox_talks", "defects"],
    }),
    toolbox_talks: workspace({
        title: _t("Toolbox Talks"),
        eyebrow: _t("SITE BRIEFING"),
        description: _t("Pre-start safety briefings with the attendance record that proves they happened."),
        model: "construction.toolbox.talk",
        action: "construction_hse.action_toolbox_talk",
        icon: "fa-users",
        tone: "teal",
        workflow: [
            [_t("Brief"), _t("Cover the topic with the crew before work starts.")],
            [_t("Record"), _t("Capture who attended, signed on site.")],
            [_t("Reuse"), _t("Feed incident lessons into the next talk.")],
        ],
        related: ["incidents", "permits", "daily_logs"],
    }),
    tenders: workspace({
        title: _t("Tender Packages"),
        eyebrow: _t("PROCUREMENT"),
        description: _t("Price a scope with several subcontractors against identical lines, then award straight into a subcontract."),
        model: "construction.tender",
        action: "construction_tender.action_tender",
        icon: "fa-gavel",
        tone: "amber",
        workflow: [
            [_t("Package"), _t("Take the scope from the BOQ so budget travels with it.")],
            [_t("Level"), _t("Compare line by line — totals hide unpriced scope.")],
            [_t("Award"), _t("Turn the winning price into a subcontract commitment.")],
        ],
        related: ["subcontracts", "boq", "cvr"],
    }),
    materials: workspace({
        title: _t("Materials & Site Stores"),
        eyebrow: _t("SITE INVENTORY"),
        description: _t("What was priced, what went into the works, what was lost, and what is still in the store."),
        model: "construction.material.summary",
        action: "construction_material.action_material_summary",
        icon: "fa-cubes",
        tone: "amber",
        allowCreate: false,
        workflow: [
            [_t("Receive"), _t("Deliveries land in the project's site store.")],
            [_t("Issue"), _t("Materials leave the store against a BOQ item.")],
            [_t("Reconcile"), _t("Consumption and waste against the priced quantity.")],
        ],
        related: ["boq", "daily_logs", "cvr"],
    }),
    cvr: workspace({
        title: _t("Cost Value Reconciliation"),
        eyebrow: _t("COMMERCIAL POSITION"),
        description: _t("Value certified against cost incurred, so margin erosion surfaces while there is still time to act."),
        model: "project.project",
        action: "construction_report.action_project_cvr",
        icon: "fa-balance-scale",
        tone: "navy",
        allowCreate: false,
        domain: [["is_construction", "=", true]],
        workflow: [
            [_t("Baseline"), _t("Approve the BOQ: contract value and target cost.")],
            [_t("Commit"), _t("Award subcontracts and certify progress both ways.")],
            [_t("Reconcile"), _t("Compare earned margin with the margin tendered.")],
        ],
        related: ["boq", "progress_billing", "subcontracts", "change_orders"],
    }),
    daily_logs: workspace({
        title: _t("Daily Site Logs"),
        eyebrow: _t("FIELD OPERATIONS"),
        description: _t("Monitor manpower, equipment, activities, weather and delays recorded by the site team."),
        model: "construction.daily.log",
        action: "construction_daily_log.action_construction_daily_log",
        icon: "fa-sun-o",
        tone: "sand",
        related: ["projects", "programme", "inspections", "defects"],
    }),
    inspections: workspace({
        title: _t("Forms & Inspections"),
        eyebrow: _t("ASSURANCE WORKFLOW"),
        description: _t("Run structured field checks, capture evidence and keep approvals moving."),
        model: "construction.form.inspection",
        action: "construction_form.action_form_inspections",
        icon: "fa-check-square-o",
        tone: "teal",
        workflow: [
            [_t("Prepare"), _t("Choose a template and define the inspection scope.")],
            [_t("Inspect"), _t("Complete checks, evidence and field observations.")],
            [_t("Approve"), _t("Review the result and close or raise follow-up work.")],
        ],
        related: ["defects", "daily_logs", "projects"],
    }),
    defects: workspace({
        title: _t("Defects & Punch List"),
        eyebrow: _t("QUALITY CONTROL"),
        description: _t("Prioritise defects, clarify responsibility and protect close-out quality."),
        model: "construction.defect",
        action: "construction_defect.action_construction_defect",
        icon: "fa-wrench",
        tone: "clay",
        workflow: [
            [_t("Identify"), _t("Capture location, severity, trade and evidence.")],
            [_t("Rectify"), _t("Assign responsibility and track corrective work.")],
            [_t("Verify"), _t("Inspect the result and close with evidence.")],
        ],
        related: ["inspections", "subcontracts", "daily_logs"],
    }),
    drawings: workspace({
        title: _t("Drawing Register"),
        eyebrow: _t("DESIGN INFORMATION"),
        description: _t("Control drawing metadata, revisions and the current approved information set."),
        model: "construction.drawing",
        action: "construction_drawing.action_construction_drawing",
        icon: "fa-file-pdf-o",
        tone: "violet",
        workflow: [
            [_t("Register"), _t("Create the drawing record and classify its discipline.")],
            [_t("Revise"), _t("Upload revisions and record their issue purpose.")],
            [_t("Publish"), _t("Mark the correct revision current for project use.")],
        ],
        related: ["rfis", "submittals", "programme"],
    }),
    rfis: workspace({
        title: _t("Requests for Information"),
        eyebrow: _t("INFORMATION FLOW"),
        description: _t("Track questions, ball-in-court ownership, responses and closure across the project team."),
        model: "construction.rfi",
        action: "construction_rfi.action_construction_rfi",
        icon: "fa-question-circle",
        tone: "blue",
        workflow: [
            [_t("Raise"), _t("Describe the information gap and reference project context.")],
            [_t("Respond"), _t("Coordinate ownership, review and formal response.")],
            [_t("Close"), _t("Confirm the answer resolves the field requirement.")],
        ],
        related: ["drawings", "submittals", "programme"],
    }),
    submittals: workspace({
        title: _t("Submittals"),
        eyebrow: _t("TECHNICAL APPROVALS"),
        description: _t("Coordinate technical submissions, multi-reviewer decisions and approval status."),
        model: "construction.submittal",
        action: "construction_submittal.action_construction_submittal",
        icon: "fa-share-square-o",
        tone: "teal",
        workflow: [
            [_t("Submit"), _t("Package the technical information and required evidence.")],
            [_t("Review"), _t("Coordinate reviewers, comments and response cycles.")],
            [_t("Release"), _t("Record the final decision and approved information.")],
        ],
        related: ["drawings", "rfis", "programme", "projects"],
    }),
    programme: workspace({
        title: _t("Programme & Planning"),
        eyebrow: _t("DELIVERY PLANNING"),
        description: _t("Manage the WBS, task ownership, dependencies and the path to on-time delivery."),
        model: "project.task",
        action: "construction_planning.action_construction_planning",
        icon: "fa-calendar",
        tone: "navy",
        related: ["projects", "daily_logs", "rfis", "submittals"],
    }),
    boq: workspace({
        title: _t("Bill of Quantities"),
        eyebrow: _t("COST BASELINE"),
        description: _t("Control measured scope, quantities, rates and the commercial baseline for each project."),
        model: "construction.boq",
        action: "construction_boq.action_construction_boq",
        icon: "fa-list-ol",
        tone: "blue",
        workflow: [
            [_t("Build"), _t("Structure sections, scope items, quantities and rates.")],
            [_t("Review"), _t("Validate the baseline against project scope.")],
            [_t("Control"), _t("Use the approved baseline for change and payment.")],
        ],
        related: ["change_orders", "progress_billing", "subcontracts", "projects"],
    }),
    change_orders: workspace({
        title: _t("Change Control"),
        eyebrow: _t("COMMERCIAL GOVERNANCE"),
        description: _t("Capture change orders, evaluate impact and maintain an auditable variation workflow."),
        model: "construction.change.order",
        action: "construction_change_order.action_change_order",
        icon: "fa-exchange",
        tone: "sand",
        workflow: [
            [_t("Identify"), _t("Register the event, cause and affected project scope.")],
            [_t("Evaluate"), _t("Assess cost, time and supporting information.")],
            [_t("Approve"), _t("Record the decision and update commercial control.")],
        ],
        related: ["boq", "progress_billing", "subcontracts", "rfis"],
    }),
    progress_billing: workspace({
        title: _t("Progress Billing"),
        eyebrow: _t("PAYMENT CONTROL"),
        description: _t("Prepare progress claims, certify measured work and track retention and amounts due."),
        model: "construction.progress.claim",
        action: "construction_progress_billing.action_progress_claim",
        icon: "fa-money",
        tone: "teal",
        workflow: [
            [_t("Measure"), _t("Capture current-period quantities and cumulative progress.")],
            [_t("Certify"), _t("Review valuation, retention and the amount due.")],
            [_t("Settle"), _t("Create the invoice and track payment completion.")],
        ],
        related: ["boq", "change_orders", "subcontracts", "projects"],
    }),
    subcontracts: workspace({
        title: _t("Subcontracts"),
        eyebrow: _t("SUPPLY CHAIN CONTROL"),
        description: _t("Manage subcontract scope, commitments, certificates, retention and back-charges."),
        model: "construction.subcontract",
        action: "construction_subcontractor.action_subcontract",
        icon: "fa-handshake-o",
        tone: "violet",
        workflow: [
            [_t("Commit"), _t("Define the subcontract scope, value and commercial terms.")],
            [_t("Certify"), _t("Measure progress and control payment certificates.")],
            [_t("Close"), _t("Resolve retention, back-charges and final obligations.")],
        ],
        related: ["boq", "progress_billing", "defects", "change_orders"],
    }),
    meetings: workspace({
        title: _t("Meetings & Minutes"),
        eyebrow: _t("SITE COORDINATION"),
        description: _t("Minutes whose actions carry forward on their own, so the item nobody is doing cannot quietly disappear."),
        model: "construction.meeting",
        action: "construction_meeting.action_meeting",
        icon: "fa-comments-o",
        tone: "navy",
        workflow: [
            [_t("Meet"), _t("Record attendance, discussion and the actions agreed.")],
            [_t("Issue"), _t("Circulate the minutes with owners and dates.")],
            [_t("Carry"), _t("Open actions move to the next meeting, keeping their age.")],
        ],
        related: ["rfis", "programme", "defects"],
    }),
    maintenance_contracts: workspace({
        area: "facilities",
        title: _t("Maintenance Contracts"),
        eyebrow: _t("CONTRACT MARGIN"),
        description: _t("What each contract covers, what it promised, and whether the work under it still costs less than the fee."),
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
            [_t("Cover"), _t("Name the assets, the scope and the SLA that was sold.")],
            [_t("Deliver"), _t("Work orders match themselves to the contract.")],
            [_t("Reconcile"), _t("Fee against absorbed cost, with recoverable work separated.")],
        ],
        related: ["work_orders", "assets", "pm_plans"],
    }),
    bim: workspace({
        title: _t("BIM Models"),
        eyebrow: _t("MODEL COORDINATION"),
        description: _t("Questions attached to the wall they are about, surviving every re-issue of the model."),
        model: "construction.bim.element",
        action: "construction_bim.action_bim_element",
        icon: "fa-cube",
        tone: "navy",
        allowCreate: false,
        workflow: [
            [_t("Index"), _t("Read the elements out of the IFC file.")],
            [_t("Link"), _t("Attach RFIs, defects, tasks and bill items to elements.")],
            [_t("Re-issue"), _t("GlobalIds are stable, so the links survive the next export.")],
        ],
        related: ["rfis", "defects", "drawings", "boq"],
    }),
    parts: workspace({
        area: "facilities",
        title: _t("Parts & Stores"),
        eyebrow: _t("SPARES CONTROL"),
        description: _t("What each store holds, what work orders have consumed, and what to buy before the next failure."),
        model: "facility.parts.summary",
        action: "facility_inventory.action_parts_summary",
        icon: "fa-cubes",
        tone: "sand",
        allowCreate: false,
        workflow: [
            [_t("Hold"), _t("Spares sit in a store attached to a building.")],
            [_t("Consume"), _t("A work order takes them out, and cost follows the stock.")],
            [_t("Reorder"), _t("The minimum on the asset's spare list finally bites.")],
        ],
        related: ["work_orders", "assets", "maintenance_contracts"],
    }),
    assets: workspace({
        area: "facilities",
        title: _t("Asset Portfolio"),
        eyebrow: _t("ASSET INTELLIGENCE"),
        description: _t("Understand the equipment portfolio, criticality, ownership and maintenance context."),
        model: "maintenance.equipment",
        action: "maintenance.hr_equipment_action",
        icon: "fa-cogs",
        tone: "blue",
        workflow: [
            [_t("Register"), _t("Capture identity, location, ownership and warranty data.")],
            [_t("Maintain"), _t("Connect work orders, PM plans, meters and job plans.")],
            [_t("Optimise"), _t("Review performance, risk and lifecycle decisions.")],
        ],
        related: ["work_orders", "pm_plans", "locations", "meters"],
    }),
    work_orders: workspace({
        area: "facilities",
        title: _t("Maintenance Work Orders"),
        eyebrow: _t("WORK DELIVERY"),
        description: _t("Triage, assign and complete corrective and preventive maintenance work."),
        model: "maintenance.request",
        action: "maintenance.hr_equipment_request_action",
        icon: "fa-clipboard",
        tone: "teal",
        workflow: [
            [_t("Triage"), _t("Confirm priority, asset, location and required response.")],
            [_t("Execute"), _t("Assign the team and complete the maintenance work.")],
            [_t("Close"), _t("Record resolution, time, cause and follow-up actions.")],
        ],
        related: ["assets", "pm_plans", "job_plans", "failure_codes"],
    }),
    pm_plans: workspace({
        area: "facilities",
        title: _t("Preventive Maintenance"),
        eyebrow: _t("RELIABILITY PLANNING"),
        description: _t("Plan calendar and meter-driven maintenance before assets fail."),
        model: "facility.pm.plan",
        action: "facility_workorder.action_pm_plan",
        icon: "fa-refresh",
        tone: "sand",
        related: ["assets", "work_orders", "job_plans", "meters"],
    }),
    job_plans: workspace({
        area: "facilities",
        title: _t("Maintenance Job Plans"),
        eyebrow: _t("STANDARD WORK"),
        description: _t("Create reusable maintenance methods, tasks, labour guidance and parts requirements."),
        model: "facility.job.plan",
        action: "facility_workorder.action_job_plan",
        icon: "fa-list-alt",
        tone: "sand",
        related: ["pm_plans", "work_orders", "assets", "failure_codes"],
    }),
    locations: workspace({
        area: "facilities",
        title: _t("Location Hierarchy"),
        eyebrow: _t("SPACE & LOCATION"),
        description: _t("Navigate sites, buildings, floors, rooms and zones with connected operational records."),
        model: "facility.location",
        action: "facility_asset.action_facility_location",
        icon: "fa-building-o",
        tone: "teal",
        related: ["floor_plans", "assets", "work_orders", "meters"],
    }),
    floor_plans: workspace({
        area: "facilities",
        title: _t("Facility Floor Plans"),
        eyebrow: _t("VISUAL OPERATIONS"),
        description: _t("Find assets and maintenance activity in their physical building context."),
        model: "facility.floorplan",
        action: "facility_floorplan.action_facility_floorplan",
        icon: "fa-map-o",
        tone: "blue",
        related: ["locations", "assets", "work_orders", "meters"],
    }),
    meters: workspace({
        area: "facilities",
        title: _t("Asset Meters"),
        eyebrow: _t("CONDITION MONITORING"),
        description: _t("Track usage and readings that drive condition-based maintenance decisions."),
        model: "facility.asset.meter",
        action: "facility_asset.action_meter",
        icon: "fa-tachometer",
        tone: "slate",
        related: ["assets", "pm_plans", "work_orders", "locations"],
    }),
    failure_codes: workspace({
        area: "facilities",
        title: _t("Failure Knowledge"),
        eyebrow: _t("RELIABILITY LEARNING"),
        description: _t("Standardise problems, causes and remedies to improve maintenance learning."),
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
        const area = AREAS[this.config.area] || AREAS.construction;
        this.suiteTitle = _t(area.suiteTitle);
        this.suiteArea = _t(area.suiteArea);
        this.areaHome = area.home;
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
        await this.openAction(this.areaHome);
    }

    async openAction(actionXmlId) {
        try {
            await this.action.doAction(actionXmlId);
        } catch {
            this.warnUnavailable();
        }
    }

    warnUnavailable() {
        const message = this.config?.area === "real_estate"
            ? _t("This Property workspace needs the Real Estate User access role. Ask your Majal administrator to enable it for your account.")
            : _t("This Majal workspace is not available for the current user.");
        this.notification.add(
            message,
            { type: "warning" }
        );
    }

    formatDate(value) {
        if (!value) {
            return "";
        }
        // `|| undefined` because pyToJsLocale returns "" for a session with no
        // lang, and Intl.DateTimeFormat("") throws rather than falling back.
        return new Intl.DateTimeFormat(user.lang || undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
        }).format(new Date(value.replace(" ", "T") + "Z"));
    }
}

for (const key of Object.keys(WORKSPACES)) {
    registry.category("actions").add(`construction_ui.workspace.${key}`, MajalWorkspaceHub);
}
