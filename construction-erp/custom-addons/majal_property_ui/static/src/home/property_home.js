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
            view: "executive",
            kpis: Object.fromEntries(
                [...PROPERTY_KPIS, ...PROPERTY_FOCUS].map((item) => [item.key, "–"])
            ),
            executive: {
                portfolioValue: 0, occupancy: 0, collection: 0, openLeads: 0,
                totalUnits: 0, available: 0, reserved: 0, blocked: 0, occupied: 0,
                developmentName: _t("Featured development"),
            },
            operations: {
                rentCollected: 0, rentScheduled: 0, leasesExpiring: 0,
                openMaintenance: 0, urgentMaintenance: 0, serviceRate: 100,
                maintenanceCards: [],
            },
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
            await this.loadControlCentre();
            this.state.loading = false;
        });
    }

    setView(view) {
        this.state.view = view;
    }

    formatMoney(value) {
        return new Intl.NumberFormat(undefined, {
            style: "currency", currency: "AED",
            notation: value >= 1000000 ? "compact" : "standard",
            maximumFractionDigits: value >= 1000000 ? 1 : 0,
        }).format(value || 0);
    }

    async loadControlCentre() {
        const safeRead = async (model, domain, fields, limit = 2000) => {
            try {
                return await this.orm.searchRead(model, domain, fields, { limit });
            } catch (error) {
                console.warn("Majal property metric unavailable", model, error);
                return [];
            }
        };
        const [units, leads, developments, rentLines, leases, requests, closed] = await Promise.all([
            safeRead("majal.unit", [], ["status", "list_price"]),
            safeRead("majal.lead", [["state", "=", "open"]], ["id"]),
            safeRead("majal.development", [["state", "=", "active"]], ["name"]),
            safeRead("majal.lease.rent.line", [], ["amount", "amount_paid"]),
            safeRead("majal.lease", [["state", "=", "active"], ["end_date", "<=", isoDate(60)]], ["id"]),
            safeRead("majal.maintenance.request", [["state", "in", ["new", "in_progress"]]],
                ["name", "state", "priority", "unit_id", "user_id", "category"], 20),
            safeRead("majal.maintenance.request", [["state", "=", "done"]], ["id"]),
        ]);
        const count = (statuses) => units.filter((unit) => statuses.includes(unit.status)).length;
        const scheduled = rentLines.reduce((sum, line) => sum + (line.amount || 0), 0);
        const paid = rentLines.reduce((sum, line) => sum + (line.amount_paid || 0), 0);
        const occupied = count(["leased", "owner_occupied", "handed_over"]);
        Object.assign(this.state.executive, {
            portfolioValue: units.reduce((sum, unit) => sum + (unit.list_price || 0), 0),
            occupancy: units.length ? occupied / units.length * 100 : 0,
            collection: scheduled ? paid / scheduled * 100 : 0,
            openLeads: leads.length, totalUnits: units.length, occupied,
            available: count(["available", "vacant"]), reserved: count(["reserved"]),
            blocked: count(["blocked", "under_maintenance"]),
            developmentName: developments[0]?.name || _t("Featured development"),
        });
        Object.assign(this.state.operations, {
            rentCollected: paid, rentScheduled: scheduled, leasesExpiring: leases.length,
            openMaintenance: requests.length,
            urgentMaintenance: requests.filter((request) => request.priority === "2").length,
            serviceRate: requests.length + closed.length ? closed.length / (requests.length + closed.length) * 100 : 100,
            maintenanceCards: requests.slice(0, 7),
        });
    }

    async openAction(actionXmlId) {
        try {
            await this.action.doAction(actionXmlId);
        } catch (error) {
            // This is normally a missing Real Estate User permission, not a
            // broken workspace. Say what the administrator needs to change so
            // a client does not have to guess from an opaque warning.
            this.notification.add(
                _t("This Majal workspace needs the matching Property access role. Ask an administrator to grant Real Estate User access."),
                { type: "warning", sticky: true }
            );
            console.warn("Majal property action could not be opened", actionXmlId, error);
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
