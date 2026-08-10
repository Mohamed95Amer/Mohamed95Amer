/** @odoo-module **/

import {
    AREAS,
    OPERATIONAL_METRICS,
    WORKSPACES,
    registerWorkspaces,
} from "@majal_suite_ui/workspace_hub/workspace_hub";

// The Property suite joins Construction and Facilities as a third area. The
// hero title and the back button follow from this one entry.
AREAS.real_estate = {
    suiteTitle: "Majal Property",
    suiteArea: "Property",
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
    // Which module owns this workspace's client action, so a tile opened
    // from another suite resolves to the right place.
    hubModule: "majal_property_ui",
    tone: "blue",
    allowCreate: true,
    domain: [],
    createContext: {},
    related: [],
    ...values,
});

const PROPERTY_WORKSPACES = {
    property_portfolio: propertyWorkspace({
        title: "Property Portfolio",
        eyebrow: "DEVELOPMENT CONTROL",
        description:
            "Every development in the portfolio, what is built, what is released for sale and what is still to come.",
        model: "majal.development",
        action: "majal_real_estate.action_majal_development",
        icon: "fa-building",
        tone: "navy",
        workflow: [
            ["Plan", "Set out the development, its communities and its buildings."],
            ["Build", "Track delivery against the construction project behind it."],
            ["Release", "Put finished stock in front of the sales floor."],
        ],
        related: ["unit_inventory", "reservations", "handovers", "leases"],
    }),
    unit_inventory: propertyWorkspace({
        title: "Unit Inventory",
        eyebrow: "STOCK & AVAILABILITY",
        description:
            "What is available, what is held and what has already gone, by development, building and floor.",
        model: "majal.unit",
        action: "majal_real_estate.action_majal_unit",
        icon: "fa-th",
        tone: "teal",
        workflow: [
            ["Define", "Generate units from a unit type across the floors it applies to."],
            ["Price", "Set the list price and the position premium."],
            ["Release", "Publish the unit to the sales floor with its status set."],
        ],
        related: ["property_portfolio", "reservations", "handovers", "unit_requests"],
    }),
    reservations: propertyWorkspace({
        title: "Sales & Reservations",
        eyebrow: "BOOKINGS PIPELINE",
        description:
            "Units held for buyers, what is still to be confirmed and what has converted to a sale.",
        model: "majal.reservation",
        action: "majal_real_estate.action_majal_reservation",
        icon: "fa-handshake-o",
        tone: "blue",
        workflow: [
            ["Reserve", "Hold the unit for a named buyer at an agreed price."],
            ["Contract", "Issue the payment plan and collect the booking amount."],
            ["Convert", "Turn the hold into a sale and raise the broker's commission."],
        ],
        related: ["leads", "installments", "commissions", "unit_inventory"],
    }),
    handovers: propertyWorkspace({
        title: "Handover & Snagging",
        eyebrow: "DELIVERY TO BUYERS",
        description:
            "Units being prepared for their buyers, the snags blocking them and what has already changed hands.",
        model: "majal.handover",
        action: "majal_real_estate.action_majal_handover",
        icon: "fa-key",
        tone: "clay",
        workflow: [
            ["Schedule", "Book the inspection with the buyer."],
            ["Inspect", "Raise snags, or pull the site's own punch list."],
            ["Hand over", "Clear the snags, settle the balance, release the keys."],
        ],
        related: ["unit_inventory", "property_portfolio", "unit_requests", "assets"],
    }),
    leases: propertyWorkspace({
        title: "Leasing & Tenancy",
        eyebrow: "OCCUPANCY & RENT",
        description:
            "Who occupies what, until when, at what rent, and which tenancies are coming up for renewal.",
        model: "majal.lease",
        action: "majal_property_operations.action_majal_lease",
        icon: "fa-file-text-o",
        tone: "violet",
        workflow: [
            ["Agree", "Set the term, the rent and the instalments it bills in."],
            ["Occupy", "Activate the lease and take the unit off the vacant list."],
            ["Renew", "Roll the tenancy forward, or hand the unit back."],
        ],
        related: ["rent_collection", "unit_requests", "unit_inventory"],
    }),
    leads: propertyWorkspace({
        title: "Sales Leads",
        eyebrow: "DEMAND PIPELINE",
        description: "Enquiries in play, who owns them and what they are looking for.",
        model: "majal.lead",
        action: "majal_real_estate.action_majal_lead",
        icon: "fa-users",
        tone: "amber",
        workflow: [
            ["Capture", "Record the enquiry and where it came from."],
            ["Qualify", "Match a budget and a unit type to a real contact."],
            ["Convert", "Hand the buyer over to a reservation."],
        ],
        related: ["reservations", "unit_inventory"],
    }),
    installments: propertyWorkspace({
        title: "Payments & Collections",
        eyebrow: "CASH COLLECTION",
        description:
            "What buyers owe, what has come in and what is past its due date.",
        model: "majal.payment.installment",
        action: "majal_real_estate.action_majal_payment_installment",
        icon: "fa-money",
        tone: "sand",
        allowCreate: false,
        workflow: [
            ["Schedule", "Generate the instalments from the buyer's payment plan."],
            ["Collect", "Record what has been received against each milestone."],
            ["Reconcile", "Chase the arrears and clear the schedule."],
        ],
        related: ["reservations", "commissions", "leases"],
    }),
    unit_requests: propertyWorkspace({
        title: "Tenant Requests",
        eyebrow: "OCCUPIED-UNIT ISSUES",
        description:
            "What occupants have reported, who is on it and what has been escalated to Facilities.",
        model: "majal.maintenance.request",
        action: "majal_property_operations.action_majal_maintenance_request",
        icon: "fa-wrench",
        tone: "coral",
        workflow: [
            ["Report", "Log what the occupant told you, against their unit."],
            ["Dispatch", "Escalate to Facilities as a work order, or handle it in house."],
            ["Verify", "Close the report once the job behind it is done."],
        ],
        related: ["leases", "work_orders", "assets"],
    }),
    commissions: propertyWorkspace({
        title: "Broker Commissions",
        eyebrow: "PARTNER EARNINGS",
        description:
            "What brokers have earned on converted sales, what is approved and what is still to pay.",
        model: "majal.commission",
        action: "majal_real_estate.action_majal_commission",
        icon: "fa-percent",
        tone: "slate",
        allowCreate: false,
        workflow: [
            ["Earn", "Raised automatically when a reservation converts to a sale."],
            ["Approve", "Sign off the amount against the agreed rate."],
            ["Pay", "Release the payment and record the date."],
        ],
        related: ["reservations", "installments"],
    }),
    rent_collection: propertyWorkspace({
        title: "Rent Collection",
        eyebrow: "TENANCY INCOME",
        description:
            "Rent instalments falling due across every active tenancy, and which of them are in arrears.",
        model: "majal.lease.rent.line",
        action: "majal_property_operations.action_majal_rent_line",
        icon: "fa-calendar-check-o",
        tone: "sand",
        allowCreate: false,
        workflow: [
            ["Schedule", "Generated from the lease term and its billing frequency."],
            ["Collect", "Record what each tenant has paid against the period."],
            ["Chase", "Work the arrears before the tenancy comes up for renewal."],
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
    { label: "Available", hint: "On the market now", icon: "fa-check-circle-o",
      requires: ["status"], filter: "available", domain: [["status", "=", "available"]] },
    { label: "Reserved", hint: "Held for a buyer", icon: "fa-bookmark-o",
      requires: ["status"], filter: "reserved", domain: [["status", "=", "reserved"]] },
    { label: "Sold", hint: "Gone, awaiting handover", icon: "fa-handshake-o",
      requires: ["status"], domain: [["status", "in", ["sold", "under_contract"]]] },
    { label: "Handover due", hint: "Ready to give to the buyer", icon: "fa-key",
      tone: "alert", requires: ["status"], domain: [["status", "=", "handover_due"]] },
];

Object.assign(OPERATIONAL_METRICS, {
    unit_inventory: unitMetrics,
    // The portfolio hub surfaces the same stock, so it shares its tiles —
    // the idiom construction_ui already uses for its own hubs.
    property_portfolio: unitMetrics,
    reservations: [
        { label: "Confirmed", hint: "Units currently held", icon: "fa-bookmark",
          requires: ["state"], filter: "confirmed", domain: [["state", "=", "confirmed"]] },
        { label: "Draft", hint: "Not yet holding anything", icon: "fa-pencil",
          requires: ["state"], filter: "draft", domain: [["state", "=", "draft"]] },
        { label: "Expiring", hint: "Hold lapses on or before today", icon: "fa-hourglass-end",
          tone: "alert", requires: ["state", "expiry_date"],
          domain: [["state", "=", "confirmed"], ["expiry_date", "<=", isoDate()]] },
        { label: "Converted", hint: "Became a sale", icon: "fa-check",
          requires: ["state"], filter: "converted", domain: [["state", "=", "converted"]] },
    ],
    installments: [
        { label: "Overdue", hint: "Past its due date and unpaid", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["is_overdue"], filter: "overdue",
          domain: [["is_overdue", "=", true]] },
        { label: "Unpaid", hint: "Nothing received yet", icon: "fa-clock-o",
          requires: ["state"], domain: [["state", "=", "pending"]] },
        { label: "Part paid", hint: "Something received, balance outstanding", icon: "fa-adjust",
          requires: ["state"], domain: [["state", "=", "partial"]] },
        { label: "Paid", hint: "Settled in full", icon: "fa-check-circle",
          requires: ["state"], filter: "paid", domain: [["state", "=", "paid"]] },
    ],
    handovers: [
        { label: "Scheduled", hint: "Inspection booked", icon: "fa-calendar",
          requires: ["state"], domain: [["state", "=", "scheduled"]] },
        { label: "Inspection", hint: "Being walked now", icon: "fa-search",
          requires: ["state"], domain: [["state", "=", "inspection"]] },
        { label: "Ready", hint: "Snag-free, awaiting the buyer", icon: "fa-key",
          requires: ["state"], domain: [["state", "=", "ready"]] },
        { label: "Open snags", hint: "Blocked until they are verified", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["open_snag_count"], filter: "with_snags",
          domain: [["open_snag_count", ">", 0]] },
    ],
    leases: [
        { label: "Active", hint: "Occupied now", icon: "fa-home",
          requires: ["state"], filter: "active", domain: [["state", "=", "active"]] },
        { label: "Expiring", hint: "Ends within 60 days", icon: "fa-hourglass-end",
          tone: "alert", requires: ["state", "end_date"], filter: "ending_soon",
          domain: [["state", "=", "active"], ["end_date", "<=", isoDate(60)]] },
        { label: "Draft", hint: "Agreed but not started", icon: "fa-pencil",
          requires: ["state"], filter: "draft", domain: [["state", "=", "draft"]] },
        { label: "Ended", hint: "Expired or terminated", icon: "fa-sign-out",
          requires: ["state"], domain: [["state", "in", ["expired", "terminated"]]] },
    ],
    leads: [
        { label: "Open", hint: "Still in play", icon: "fa-folder-open-o",
          requires: ["state"], filter: "open", domain: [["state", "=", "open"]] },
        { label: "Won", hint: "Converted to a reservation", icon: "fa-trophy",
          requires: ["state"], filter: "won", domain: [["state", "=", "won"]] },
        { label: "Lost", hint: "Went elsewhere", icon: "fa-times-circle-o",
          requires: ["state"], filter: "lost", domain: [["state", "=", "lost"]] },
    ],
    unit_requests: [
        { label: "New", hint: "Nobody has picked it up", icon: "fa-inbox",
          tone: "alert", requires: ["state"], domain: [["state", "=", "new"]] },
        { label: "In progress", hint: "Being dealt with", icon: "fa-wrench",
          requires: ["state"], domain: [["state", "=", "in_progress"]] },
        { label: "Urgent", hint: "Flagged urgent and still open", icon: "fa-exclamation-triangle",
          tone: "alert", requires: ["priority", "state"], filter: "urgent",
          domain: [["priority", "=", "2"], ["state", "in", ["new", "in_progress"]]] },
        { label: "Done", hint: "Closed out", icon: "fa-check",
          requires: ["state"], domain: [["state", "=", "done"]] },
    ],
});

registerWorkspaces(Object.keys(PROPERTY_WORKSPACES));
