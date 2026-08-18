/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import {
    AREAS,
    MajalWorkspaceHub,
    OPERATIONAL_METRICS,
    WORKSPACES,
} from "@construction_ui/workspace_hub/workspace_hub";

// The Property suite joins Construction and Facilities as a third area. The
// hero title and the back button follow from this one entry.
AREAS.real_estate = {
    suiteTitle: _t("Majal Property"),
    suiteArea: _t("Property"),
    home: "majal_property_ui.action_property_home",
};

// Domains are plain data, so a date has to be a literal by the time it gets
// there. Resolved at import like construction_ui's own daysAgo().
const isoDate = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
};

const propertyWorkspace = (values) => ({
    area: "real_estate",
    tone: "blue",
    allowCreate: true,
    domain: [],
    createContext: {},
    related: [],
    ...values,
});

const PROPERTY_WORKSPACES = {
    property_portfolio: propertyWorkspace({
        title: _t("Property Portfolio"),
        eyebrow: _t("DEVELOPMENT CONTROL"),
        description: _t("Every development in the portfolio, what is built, what is released for sale and what is still to come."),
        model: "majal.development",
        action: "majal_real_estate.action_majal_development",
        icon: "fa-building",
        tone: "navy",
        workflow: [
            [_t("Plan"), _t("Set out the development, its communities and its buildings.")],
            [_t("Build"), _t("Track delivery against the construction project behind it.")],
            [_t("Release"), _t("Put finished stock in front of the sales floor.")],
        ],
        related: ["unit_inventory", "reservations", "handovers", "leases"],
    }),
    unit_inventory: propertyWorkspace({
        title: _t("Unit Inventory"),
        eyebrow: _t("STOCK & AVAILABILITY"),
        description: _t("What is available, what is held and what has already gone, by development, building and floor."),
        model: "majal.unit",
        action: "majal_real_estate.action_majal_unit",
        icon: "fa-th",
        tone: "teal",
        workflow: [
            [_t("Define"), _t("Generate units from a unit type across the floors it applies to.")],
            [_t("Price"), _t("Set the list price and the position premium.")],
            [_t("Release"), _t("Publish the unit to the sales floor with its status set.")],
        ],
        related: ["property_portfolio", "reservations", "handovers", "unit_requests"],
    }),
    reservations: propertyWorkspace({
        title: _t("Sales & Reservations"),
        eyebrow: _t("BOOKINGS PIPELINE"),
        description: _t("Units held for buyers, what is still to be confirmed and what has converted to a sale."),
        model: "majal.reservation",
        action: "majal_real_estate.action_majal_reservation",
        icon: "fa-handshake-o",
        tone: "blue",
        workflow: [
            [_t("Reserve"), _t("Hold the unit for a named buyer at an agreed price.")],
            [_t("Contract"), _t("Issue the payment plan and collect the booking amount.")],
            [_t("Convert"), _t("Turn the hold into a sale and raise the broker's commission.")],
        ],
        related: ["leads", "installments", "commissions", "unit_inventory"],
    }),
    handovers: propertyWorkspace({
        title: _t("Handover & Snagging"),
        eyebrow: _t("DELIVERY TO BUYERS"),
        description: _t("Units being prepared for their buyers, the snags blocking them and what has already changed hands."),
        model: "majal.handover",
        action: "majal_real_estate.action_majal_handover",
        icon: "fa-key",
        tone: "clay",
        workflow: [
            [_t("Schedule"), _t("Book the inspection with the buyer.")],
            [_t("Inspect"), _t("Raise snags, or pull the site's own punch list.")],
            [_t("Hand over"), _t("Clear the snags, settle the balance, release the keys.")],
        ],
        related: ["unit_inventory", "property_portfolio", "unit_requests", "assets"],
    }),
    leases: propertyWorkspace({
        title: _t("Leasing & Tenancy"),
        eyebrow: _t("OCCUPANCY & RENT"),
        description: _t("Who occupies what, until when, at what rent, and which tenancies are coming up for renewal."),
        model: "majal.lease",
        action: "majal_property_operations.action_majal_lease",
        icon: "fa-file-text-o",
        tone: "violet",
        workflow: [
            [_t("Agree"), _t("Set the term, the rent and the instalments it bills in.")],
            [_t("Occupy"), _t("Activate the lease and take the unit off the vacant list.")],
            [_t("Renew"), _t("Roll the tenancy forward, or hand the unit back.")],
        ],
        related: ["rent_collection", "unit_requests", "unit_inventory"],
    }),
    leads: propertyWorkspace({
        title: _t("Sales Leads"),
        eyebrow: _t("DEMAND PIPELINE"),
        description: _t("Enquiries in play, who owns them and what they are looking for."),
        model: "majal.lead",
        action: "majal_real_estate.action_majal_lead",
        icon: "fa-users",
        tone: "amber",
        workflow: [
            [_t("Capture"), _t("Record the enquiry and where it came from.")],
            [_t("Qualify"), _t("Match a budget and a unit type to a real contact.")],
            [_t("Convert"), _t("Hand the buyer over to a reservation.")],
        ],
        related: ["reservations", "unit_inventory"],
    }),
    installments: propertyWorkspace({
        title: _t("Payments & Collections"),
        eyebrow: _t("CASH COLLECTION"),
        description: _t("What buyers owe, what has come in and what is past its due date."),
        model: "majal.payment.installment",
        action: "majal_real_estate.action_majal_payment_installment",
        icon: "fa-money",
        tone: "sand",
        allowCreate: false,
        workflow: [
            [_t("Schedule"), _t("Generate the instalments from the buyer's payment plan.")],
            [_t("Collect"), _t("Record what has been received against each milestone.")],
            [_t("Reconcile"), _t("Chase the arrears and clear the schedule.")],
        ],
        related: ["reservations", "commissions", "leases"],
    }),
    unit_requests: propertyWorkspace({
        title: _t("Tenant Requests"),
        eyebrow: _t("OCCUPIED-UNIT ISSUES"),
        description: _t("What occupants have reported, who is on it and what has been escalated to Facilities."),
        model: "majal.maintenance.request",
        action: "majal_property_operations.action_majal_maintenance_request",
        icon: "fa-wrench",
        tone: "coral",
        workflow: [
            [_t("Report"), _t("Log what the occupant told you, against their unit.")],
            [_t("Dispatch"), _t("Escalate to Facilities as a work order, or handle it in house.")],
            [_t("Verify"), _t("Close the report once the job behind it is done.")],
        ],
        related: ["leases", "work_orders", "assets"],
    }),
    commissions: propertyWorkspace({
        title: _t("Broker Commissions"),
        eyebrow: _t("PARTNER EARNINGS"),
        description: _t("What brokers have earned on converted sales, what is approved and what is still to pay."),
        model: "majal.commission",
        action: "majal_real_estate.action_majal_commission",
        icon: "fa-percent",
        tone: "slate",
        allowCreate: false,
        workflow: [
            [_t("Earn"), _t("Raised automatically when a reservation converts to a sale.")],
            [_t("Approve"), _t("Sign off the amount against the agreed rate.")],
            [_t("Pay"), _t("Release the payment and record the date.")],
        ],
        related: ["reservations", "installments"],
    }),
    rent_collection: propertyWorkspace({
        title: _t("Rent Collection"),
        eyebrow: _t("TENANCY INCOME"),
        description: _t("Rent instalments falling due across every active tenancy, and which of them are in arrears."),
        model: "majal.lease.rent.line",
        action: "majal_property_operations.action_majal_rent_line",
        icon: "fa-calendar-check-o",
        tone: "sand",
        allowCreate: false,
        workflow: [
            [_t("Schedule"), _t("Generated from the lease term and its billing frequency.")],
            [_t("Collect"), _t("Record what each tenant has paid against the period.")],
            [_t("Chase"), _t("Work the arrears before the tenancy comes up for renewal.")],
        ],
        related: ["leases", "unit_requests"],
    }),
};

Object.assign(WORKSPACES, PROPERTY_WORKSPACES);

// Metrics answer "what is open, overdue, waiting on me" for each register.
// `requires` drops a tile if the model loses the field; `filter` opens the
// module's own action with a removable search facet rather than a hidden
// domain.
const unitMetrics = [
    { label: _t("Available"), hint: _t("On the market now"), icon: "fa-check-circle-o",
      requires: ["status"], filter: "available", domain: [["status", "=", "available"]] },
    { label: _t("Reserved"), hint: _t("Held for a buyer"), icon: "fa-bookmark-o",
      requires: ["status"], filter: "reserved", domain: [["status", "=", "reserved"]] },
    { label: _t("Sold"), hint: _t("Gone, awaiting handover"), icon: "fa-handshake-o",
      requires: ["status"], domain: [["status", "in", ["sold", "under_contract"]]] },
    { label: _t("Handover due"), hint: _t("Ready to give to the buyer"), icon: "fa-key",
      tone: "alert", requires: ["status"], domain: [["status", "=", "handover_due"]] },
];

Object.assign(OPERATIONAL_METRICS, {
    unit_inventory: unitMetrics,
    // The portfolio hub surfaces the same stock, so it shares its tiles —
    // the idiom construction_ui already uses for its own hubs.
    property_portfolio: unitMetrics,
    reservations: [
        { label: _t("Confirmed"), hint: _t("Units currently held"), icon: "fa-bookmark",
          requires: ["state"], filter: "confirmed", domain: [["state", "=", "confirmed"]] },
        { label: _t("Draft"), hint: _t("Not yet holding anything"), icon: "fa-pencil",
          requires: ["state"], filter: "draft", domain: [["state", "=", "draft"]] },
        { label: _t("Expiring"), hint: _t("Hold lapses on or before today"), icon: "fa-hourglass-end",
          tone: "alert", requires: ["state", "expiry_date"],
          domain: [["state", "=", "confirmed"], ["expiry_date", "<=", isoDate()]] },
        { label: _t("Converted"), hint: _t("Became a sale"), icon: "fa-check",
          requires: ["state"], filter: "converted", domain: [["state", "=", "converted"]] },
    ],
    installments: [
        { label: _t("Overdue"), hint: _t("Past its due date and unpaid"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_overdue"], filter: "overdue",
          domain: [["is_overdue", "=", true]] },
        { label: _t("Unpaid"), hint: _t("Nothing received yet"), icon: "fa-clock-o",
          requires: ["state"], domain: [["state", "=", "pending"]] },
        { label: _t("Part paid"), hint: _t("Something received, balance outstanding"), icon: "fa-adjust",
          requires: ["state"], domain: [["state", "=", "partial"]] },
        { label: _t("Paid"), hint: _t("Settled in full"), icon: "fa-check-circle",
          requires: ["state"], filter: "paid", domain: [["state", "=", "paid"]] },
    ],
    handovers: [
        { label: _t("Scheduled"), hint: _t("Inspection booked"), icon: "fa-calendar",
          requires: ["state"], domain: [["state", "=", "scheduled"]] },
        { label: _t("Inspection"), hint: _t("Being walked now"), icon: "fa-search",
          requires: ["state"], domain: [["state", "=", "inspection"]] },
        { label: _t("Ready"), hint: _t("Snag-free, awaiting the buyer"), icon: "fa-key",
          requires: ["state"], domain: [["state", "=", "ready"]] },
        { label: _t("Open snags"), hint: _t("Blocked until they are verified"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["open_snag_count"], filter: "with_snags",
          domain: [["open_snag_count", ">", 0]] },
    ],
    leases: [
        { label: _t("Active"), hint: _t("Occupied now"), icon: "fa-home",
          requires: ["state"], filter: "active", domain: [["state", "=", "active"]] },
        { label: _t("Expiring"), hint: _t("Ends within 60 days"), icon: "fa-hourglass-end",
          tone: "alert", requires: ["state", "end_date"], filter: "ending_soon",
          domain: [["state", "=", "active"], ["end_date", "<=", isoDate(60)]] },
        { label: _t("Draft"), hint: _t("Agreed but not started"), icon: "fa-pencil",
          requires: ["state"], filter: "draft", domain: [["state", "=", "draft"]] },
        { label: _t("Ended"), hint: _t("Expired or terminated"), icon: "fa-sign-out",
          requires: ["state"], domain: [["state", "in", ["expired", "terminated"]]] },
    ],
    leads: [
        { label: _t("Open"), hint: _t("Still in play"), icon: "fa-folder-open-o",
          requires: ["state"], filter: "open", domain: [["state", "=", "open"]] },
        { label: _t("Won"), hint: _t("Converted to a reservation"), icon: "fa-trophy",
          requires: ["state"], filter: "won", domain: [["state", "=", "won"]] },
        { label: _t("Lost"), hint: _t("Went elsewhere"), icon: "fa-times-circle-o",
          requires: ["state"], filter: "lost", domain: [["state", "=", "lost"]] },
    ],
    unit_requests: [
        { label: _t("New"), hint: _t("Nobody has picked it up"), icon: "fa-inbox",
          tone: "alert", requires: ["state"], domain: [["state", "=", "new"]] },
        { label: _t("In progress"), hint: _t("Being dealt with"), icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: _t("Urgent"), hint: _t("Flagged urgent and still open"), icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["priority", "state"], filter: "urgent",
          domain: [["priority", "=", "2"], ["state", "in", ["new", "in_progress"]]] },
        { label: _t("Done"), hint: _t("Closed out"), icon: "fa-check",
          requires: ["state"], domain: [["state", "=", "done"]] },
    ],
});

// The tag prefix belongs to the hub component — workspaceKey is derived by
// stripping exactly this string — so property workspaces reuse it rather than
// inventing their own namespace.
for (const key of Object.keys(PROPERTY_WORKSPACES)) {
    registry.category("actions").add(`construction_ui.workspace.${key}`, MajalWorkspaceHub);
}
