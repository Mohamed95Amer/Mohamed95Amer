/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
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

const isoDate = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
};
const today = isoDate();

// The portfolio in four numbers: what there is to sell, what is held, what is
// owed and who is living in it.
const PROPERTY_KPIS = [
    {
        key: "availableUnits",
        label: "Available units",
        model: "majal.unit",
        domain: [["status", "=", "available"]],
        action: "majal_real_estate.action_majal_unit",
        icon: "fa-th",
        tone: "teal",
        hint: "On the market now",
        workspace: "unit_inventory",
    },
    {
        key: "heldUnits",
        label: "Units held",
        model: "majal.reservation",
        domain: [["state", "=", "confirmed"]],
        action: "majal_real_estate.action_majal_reservation",
        icon: "fa-bookmark",
        tone: "blue",
        hint: "Confirmed reservations",
        workspace: "reservations",
    },
    {
        key: "activeLeases",
        label: "Active tenancies",
        model: "majal.lease",
        domain: [["state", "=", "active"]],
        action: "majal_property_operations.action_majal_lease",
        icon: "fa-home",
        tone: "sand",
        hint: "Occupied and billing",
        workspace: "leases",
    },
    {
        key: "handoversDue",
        label: "Handovers in flight",
        model: "majal.handover",
        domain: [["state", "in", ["draft", "scheduled", "inspection", "ready"]]],
        action: "majal_real_estate.action_majal_handover",
        icon: "fa-key",
        tone: "clay",
        hint: "Not yet handed over",
        workspace: "handovers",
    },
];

// Focus counts what is *breaking a promise* — money late, holds about to
// lapse, keys blocked, tenants waiting — not what merely exists. The KPI row
// above already reports the portfolio.
const PROPERTY_FOCUS = [
    {
        key: "overdueInstallments",
        label: "Payments overdue",
        caption: "Past the due date",
        model: "majal.payment.installment",
        domain: [["is_overdue", "=", true]],
        action: "majal_real_estate.action_majal_payment_installment",
        filter: "overdue",
        icon: "fa-exclamation-triangle",
        workspace: "installments",
    },
    {
        key: "expiringHolds",
        label: "Holds expiring",
        caption: "Lapse today or sooner",
        model: "majal.reservation",
        domain: [["state", "=", "confirmed"], ["expiry_date", "<=", today]],
        action: "majal_real_estate.action_majal_reservation",
        icon: "fa-hourglass-end",
        workspace: "reservations",
    },
    {
        key: "blockedHandovers",
        label: "Handovers blocked",
        caption: "Snags to clear",
        model: "majal.handover",
        domain: [["open_snag_count", ">", 0],
                 ["state", "in", ["draft", "scheduled", "inspection", "ready"]]],
        action: "majal_real_estate.action_majal_handover",
        filter: "with_snags",
        icon: "fa-wrench",
        workspace: "handovers",
    },
    {
        key: "openTenantRequests",
        label: "Tenant requests open",
        caption: "Somebody is waiting",
        model: "majal.maintenance.request",
        domain: [["state", "in", ["new", "in_progress"]]],
        action: "majal_property_operations.action_majal_maintenance_request",
        filter: "open",
        icon: "fa-bell",
        workspace: "unit_requests",
    },
];

const PROPERTY_GROUPS = [
    {
        title: "Portfolio",
        subtitle: "What you own and what is in it",
        apps: [
            {
                name: "Developments",
                description: "Sites, communities, buildings and floors",
                icon: "fa-building",
                tone: "navy",
                workspace: "property_portfolio",
            },
            {
                name: "Unit inventory",
                description: "Stock, pricing, availability and status",
                icon: "fa-th",
                tone: "teal",
                workspace: "unit_inventory",
            },
        ],
    },
    {
        title: "Selling",
        subtitle: "From enquiry to signed sale",
        apps: [
            {
                name: "Leads",
                description: "Enquiries, budgets and what they want",
                icon: "fa-users",
                tone: "amber",
                workspace: "leads",
            },
            {
                name: "Reservations",
                description: "Units held for named buyers",
                icon: "fa-handshake-o",
                tone: "blue",
                workspace: "reservations",
            },
            {
                name: "Payments",
                description: "Instalment schedules and arrears",
                icon: "fa-money",
                tone: "sand",
                workspace: "installments",
            },
            {
                name: "Commissions",
                description: "What brokers earned and what is paid",
                icon: "fa-percent",
                tone: "slate",
                workspace: "commissions",
            },
        ],
    },
    {
        title: "Delivering & operating",
        subtitle: "Keys, tenancies and the people in the building",
        apps: [
            {
                name: "Handovers",
                description: "Inspections, snag lists and keys",
                icon: "fa-key",
                tone: "clay",
                workspace: "handovers",
            },
            {
                name: "Leases",
                description: "Terms, renewals and occupancy",
                icon: "fa-file-text-o",
                tone: "violet",
                workspace: "leases",
            },
            {
                name: "Rent collection",
                description: "What is due across every tenancy",
                icon: "fa-calendar-check-o",
                tone: "sand",
                workspace: "rent_collection",
            },
            {
                name: "Tenant requests",
                description: "Faults reported in occupied units",
                icon: "fa-wrench",
                tone: "coral",
                workspace: "unit_requests",
            },
        ],
    },
];

export class PropertyHome extends Component {
    static template = "majal_property_ui.PropertyHome";

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.state = useState({
            loading: true,
            kpis: Object.fromEntries(
                [...PROPERTY_KPIS, ...PROPERTY_FOCUS].map((item) => [item.key, "–"])
            ),
        });
        this.kpiDefinitions = localizeItems(PROPERTY_KPIS);
        this.focusItems = localizeItems(PROPERTY_FOCUS);
        this.appGroups = localizeItems(PROPERTY_GROUPS);
        const interfaceLocale = document.body.classList.contains("o_rtl") ? "ar-AE" : undefined;
        this.today = new Intl.DateTimeFormat(interfaceLocale, {
            weekday: "long",
            day: "numeric",
            month: "long",
            numberingSystem: interfaceLocale ? "arab" : undefined,
        }).format(new Date());

        onWillStart(async () => {
            const counted = [...PROPERTY_KPIS, ...PROPERTY_FOCUS];
            // allSettled, not all: a module the user cannot read must dim one
            // tile, not blank the whole page.
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
        await this.openAction(`majal_property_ui.action_workspace_${workspaceKey}`);
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
                // fall through to the workspace
            }
        }
        await this.openWorkspace(item.workspace);
    }

    formatAppCount(count) {
        return _t("%s apps", count);
    }
}

registry.category("actions").add("majal_property_ui.property_home", PropertyHome);
