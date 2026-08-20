/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";

const compact = (value) => {
    const number = Number(value || 0);
    const absolute = Math.abs(number);
    if (absolute >= 1_000_000_000) {
        return `${(number / 1_000_000_000).toFixed(1)}B`;
    }
    if (absolute >= 1_000_000) {
        return `${(number / 1_000_000).toFixed(1)}M`;
    }
    if (absolute >= 1_000) {
        return `${(number / 1_000).toFixed(1)}K`;
    }
    return `${Math.round(number)}`;
};

export class MajalDashboardHub extends Component {
    static template = "construction_ui.DashboardHub";
    static props = {
        action: { type: Object, optional: true },
        actionId: { type: [Number, Boolean], optional: true },
        className: { type: String, optional: true },
        updateActionState: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({
            loading: true,
            canConfigure: false,
            portfolio: {},
            facilities: {
                assets: 0,
                locations: 0,
                openOrders: 0,
                breached: 0,
            },
        });
        onWillStart(async () => {
            const [canConfigure] = await Promise.all([
                user.hasGroup("construction_ui.group_dashboard_designer"),
                this.load(),
            ]);
            this.state.canConfigure = canConfigure;
        });
    }

    async safeCount(model, domain = []) {
        try {
            return await this.orm.searchCount(model, domain);
        } catch {
            return 0;
        }
    }

    async load() {
        const portfolioPromise = this.orm.call(
            "construction.dashboard", "get_dashboard_data", [null]
        ).catch(() => ({ portfolio: {} }));
        const [data, assets, locations, openOrders, breached] = await Promise.all([
            portfolioPromise,
            this.safeCount("maintenance.equipment"),
            this.safeCount("facility.location"),
            this.safeCount("maintenance.request", [["stage_id.done", "=", false]]),
            this.safeCount("maintenance.request", [["sla_breached", "=", true]]),
        ]);
        this.state.portfolio = data.portfolio || {};
        Object.assign(this.state.facilities, {
            assets,
            locations,
            openOrders,
            breached,
        });
        this.state.loading = false;
    }

    get cards() {
        return [
            {
                key: "executive",
                icon: "fa-line-chart",
                eyebrow: _t("OWNER VIEW"),
                title: _t("Executive Portfolio"),
                description: _t(
                    "Compare contract value, margin, programme, quality, safety, and material performance across every project."
                ),
                action: "construction_dashboard.action_construction_dashboard",
                tone: "navy",
            },
            {
                key: "construction",
                icon: "fa-building-o",
                eyebrow: _t("CONSTRUCTION"),
                title: _t("Construction Operations"),
                description: _t(
                    "Open projects, site records, engineering workflows, commercial controls, and the daily risk picture."
                ),
                action: "construction_ui.action_construction_home",
                tone: "teal",
            },
            {
                key: "facilities",
                icon: "fa-wrench",
                eyebrow: _t("FACILITIES"),
                title: _t("Facilities Operations"),
                description: _t(
                    "Monitor assets, locations, work orders, preventive maintenance, service levels, contracts, and parts."
                ),
                action: "construction_ui.action_facility_home",
                tone: "blue",
            },
            {
                key: "commercial",
                icon: "fa-balance-scale",
                eyebrow: _t("COMMERCIAL"),
                title: _t("Commercial Exposure"),
                description: _t(
                    "See unapproved change, certification, billing, commitment, and forecast-margin exposure before month end."
                ),
                action: "construction_report.action_exposure",
                tone: "amber",
            },
            {
                key: "my_day",
                icon: "fa-check-square-o",
                eyebrow: _t("PERSONAL CONTROL"),
                title: _t("My Day"),
                description: _t(
                    "One prioritised queue for approvals, overdue actions, assigned defects, inspections, and work orders."
                ),
                action: "construction_ui.action_my_day",
                tone: "green",
            },
            {
                key: "analytics",
                icon: "fa-table",
                eyebrow: _t("SELF-SERVICE"),
                title: _t("Analytical Workbooks"),
                description: _t(
                    "Open configurable spreadsheet dashboards for finance, sales, inventory, and other installed business areas."
                ),
                action: "spreadsheet_dashboard.ir_actions_dashboard_action",
                tone: "slate",
            },
        ];
    }

    get kpis() {
        const portfolio = this.state.portfolio;
        const facilities = this.state.facilities;
        return [
            {
                label: _t("Live projects"),
                value: portfolio.projects || 0,
                note: _t("%s at risk", portfolio.at_risk || 0),
                alert: Boolean(portfolio.at_risk),
            },
            {
                label: _t("Contract portfolio"),
                value: compact(portfolio.contract_value),
                note: _t(
                    "%s certified",
                    `${Number(portfolio.percent_complete || 0).toFixed(1)}%`
                ),
            },
            {
                label: _t("Programme exceptions"),
                value: portfolio.slipping || 0,
                note: _t("%s days worst slip", Math.round(portfolio.worst_slip || 0)),
                alert: Boolean(portfolio.slipping),
            },
            {
                label: _t("Open defects"),
                value: portfolio.open_defects || 0,
                note: _t("%s overdue RFIs", portfolio.overdue_rfis || 0),
                alert: Boolean(portfolio.open_defects || portfolio.overdue_rfis),
            },
            {
                label: _t("Facility assets"),
                value: facilities.assets,
                note: _t("Across %s locations", facilities.locations),
            },
            {
                label: _t("Open work orders"),
                value: facilities.openOrders,
                note: _t("%s SLA breaches", facilities.breached),
                alert: Boolean(facilities.breached),
            },
        ];
    }

    openAction(action) {
        return this.action.doAction(action);
    }

    createDashboard() {
        return this.action.doAction("spreadsheet_oca.spreadsheet_spreadsheet_act_window", {
            additionalContext: { default_name: _t("My management dashboard") },
        });
    }

    manageDashboards() {
        return this.action.doAction(
            "spreadsheet_dashboard.spreadsheet_dashboard_action_configuration_dashboards"
        );
    }
}

registry.category("actions").add("construction_ui.dashboard_hub", MajalDashboardHub);
