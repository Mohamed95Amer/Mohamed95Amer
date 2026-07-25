/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// Majal palette. Charts are drawn as inline SVG rather than pulled from a
// charting library: the backend bundle should not carry a second rendering
// engine for a dozen bars, and hand-drawn marks keep the same colour language
// as the rest of the suite.
const SERIES_COLOURS = [
    "#346d75", "#c59b52", "#6b8f9c", "#a8763c", "#4c8577", "#8a6b9c",
];
const GOOD = "#3f7d5c";
const BAD = "#c0483c";
const NEUTRAL = "#697983";

/** Compact money: a portfolio strip cannot show 10,592,000.00 six times. */
const compact = (value) => {
    const abs = Math.abs(value || 0);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
    return `${Math.round(value || 0)}`;
};

export class ConstructionDashboard extends Component {
    static template = "construction_dashboard.Dashboard";
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
            error: false,
            data: null,
            selected: [],          // project ids being compared
            metric: "forecast_margin_percent",
        });
        onWillStart(() => this.load());
    }

    async load() {
        this.state.loading = true;
        try {
            const data = await this.orm.call(
                "construction.dashboard", "get_dashboard_data", [null]
            );
            this.state.data = data;
            // Default to the jobs that are actually running. A tender-stage
            // project has no bill yet, so it contributes an empty row to every
            // chart and flattens the scale the others are compared on — it is
            // still one chip away for anyone who wants it.
            const priced = data.projects.filter((p) => p.contract_value > 0);
            this.state.selected = (priced.length ? priced : data.projects)
                .map((p) => p.id);
        } catch {
            this.state.error = true;
        } finally {
            this.state.loading = false;
        }
    }

    get projects() {
        return this.state.data ? this.state.data.projects : [];
    }

    get portfolio() {
        return this.state.data ? this.state.data.portfolio : {};
    }

    get metrics() {
        return this.state.data ? this.state.data.metrics : [];
    }

    get currency() {
        return this.state.data ? this.state.data.currency : "";
    }

    get compared() {
        return this.projects.filter((p) => this.state.selected.includes(p.id));
    }

    toggleProject(id) {
        const selected = this.state.selected;
        this.state.selected = selected.includes(id)
            ? selected.filter((x) => x !== id)
            : [...selected, id];
    }

    selectAll() {
        this.state.selected = this.projects.map((p) => p.id);
    }

    selectNone() {
        this.state.selected = [];
    }

    setMetric(key) {
        this.state.metric = key;
    }

    get activeMetric() {
        return this.metrics.find((m) => m.key === this.state.metric) || this.metrics[0];
    }

    formatValue(value, unit) {
        if (unit === "percent") return `${(value || 0).toFixed(1)}%`;
        if (unit === "currency") return `${this.currency}${compact(value)}`;
        if (unit === "rate") return (value || 0).toFixed(2);
        if (unit === "days") return `${Math.round(value || 0)}d`;
        return `${Math.round(value || 0)}`;
    }

    money(value) {
        return `${this.currency}${compact(value)}`;
    }

    /**
     * Bars for the metric being compared.
     *
     * Scaled against the largest absolute value in the selection so the
     * comparison is between projects, and coloured by whether the value is
     * good or bad for that metric rather than by series index — a red bar
     * should mean trouble, not "the second project".
     */
    get comparisonBars() {
        const metric = this.activeMetric;
        if (!metric) return [];
        const rows = this.compared;
        const max = Math.max(...rows.map((r) => Math.abs(r[metric.key] || 0)), 1);
        return rows.map((row, index) => {
            const value = row[metric.key] || 0;
            const share = Math.abs(value) / max;
            let colour = SERIES_COLOURS[index % SERIES_COLOURS.length];
            if (metric.better === "high") {
                colour = value < 0 ? BAD : colour;
            } else if (value > 0) {
                // Only flag a "lower is better" metric once it is the worst of
                // the set; one open defect is not a crisis.
                colour = share > 0.66 ? BAD : colour;
            }
            return {
                id: row.id,
                name: row.name,
                value,
                label: this.formatValue(value, metric.unit),
                width: Math.max(share * 100, value ? 2 : 0),
                colour,
                negative: value < 0,
            };
        });
    }

    /** Certified vs contract, as a progress track per project. */
    get progressRows() {
        return this.compared.map((row) => ({
            id: row.id,
            name: row.name,
            percent: Math.min(Math.max(row.percent_complete || 0, 0), 100),
            certified: this.money(row.certified_value),
            contract: this.money(row.contract_value),
            slipping: row.programme_slip > 0,
            slip: row.programme_slip,
        }));
    }

    /**
     * Cost structure per project: certified value against the cost stack.
     * Shown as paired bars because the gap between them is the margin, and a
     * pie of one project's costs answers no question a manager has.
     */
    get costRows() {
        const rows = this.compared;
        const max = Math.max(
            ...rows.map((r) => Math.max(r.contract_value || 0, r.committed_cost || 0, r.budget_cost || 0)),
            1
        );
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            contractWidth: ((row.contract_value || 0) / max) * 100,
            budgetWidth: ((row.budget_cost || 0) / max) * 100,
            committedWidth: ((row.committed_cost || 0) / max) * 100,
            certifiedWidth: ((row.certified_value || 0) / max) * 100,
            contract: this.money(row.contract_value),
            budget: this.money(row.budget_cost),
            committed: this.money(row.committed_cost),
            certified: this.money(row.certified_value),
            overCommitted: (row.committed_cost || 0) > (row.budget_cost || 0),
        }));
    }

    /** Per-project health flags, worst first — the triage list. */
    get watchlist() {
        const issues = [];
        for (const row of this.compared) {
            if (row.margin_variance < 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "bad",
                    label: _t("Margin eroding"),
                    detail: this.money(row.margin_variance),
                });
            }
            if (row.programme_slip > 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "warn",
                    label: _t("Behind baseline"),
                    detail: _t("%s days", Math.round(row.programme_slip)),
                });
            }
            if (row.overdue_rfis > 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "warn",
                    label: _t("Overdue RFIs"), detail: `${row.overdue_rfis}`,
                });
            }
            if (row.high_defects > 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "warn",
                    label: _t("High-severity defects"), detail: `${row.high_defects}`,
                });
            }
            if (row.lti_count > 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "bad",
                    label: _t("Lost time injuries"), detail: `${row.lti_count}`,
                });
            }
            if (row.waste_percent > 5) {
                issues.push({
                    id: row.id, project: row.name, tone: "warn",
                    label: _t("Material waste"),
                    detail: `${row.waste_percent.toFixed(1)}%`,
                });
            }
            if (row.materials_over_budget > 0) {
                issues.push({
                    id: row.id, project: row.name, tone: "warn",
                    label: _t("Materials over budget"),
                    detail: `${row.materials_over_budget}`,
                });
            }
        }
        const rank = { bad: 0, warn: 1 };
        return issues.sort((a, b) => rank[a.tone] - rank[b.tone]);
    }

    get hasWatchlist() {
        return this.watchlist.length > 0;
    }

    openProject(projectId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "project.project",
            res_id: projectId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    async openAction(xmlid) {
        try {
            await this.action.doAction(xmlid);
        } catch {
            // A drill-down whose module is not installed simply stays put.
        }
    }
}

registry.category("actions").add("construction_dashboard.main", ConstructionDashboard);
