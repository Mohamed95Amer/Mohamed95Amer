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
// Exported so a downstream suite (Property) can register its own tiles with
// Object.assign rather than this file growing an entry per app.


// One entry per suite the workspaces belong to. A lookup rather than a chain
// of ternaries so the next app that joins the platform registers itself here
// instead of editing three separate expressions in this file.
// Strings are plain English and translated at setup, matching localizeConfig.

// Empty registries. Each suite -- Construction, Facilities, Property --
// fills these at import time and calls registerWorkspaces with its own keys,
// so the shell carries no knowledge of any particular application and a
// customer who bought only one of them can install it on its own.
export const OPERATIONAL_METRICS = {};
export const AREAS = {};
export const WORKSPACES = {};

export const workspace = (values) => ({
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


};

export class MajalWorkspaceHub extends Component {
    static template = "majal_suite_ui.MajalWorkspaceHub";
    static props = ["*"];

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.workspaceKey = (this.props.action?.tag || "").replace("majal_suite_ui.workspace.", "");
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
        // Which module owns the action is part of the workspace's own config:
        // a Facilities tile opened from a Property workspace lives in another
        // module, and hardcoding one prefix silently breaks the other.
        const owner = WORKSPACES[key]?.hubModule || "construction_ui";
        await this.openAction(`${owner}.action_workspace_${key}`);
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

/** Bind a suite's workspace keys to the hub component. */
export function registerWorkspaces(keys) {
    for (const key of keys) {
        registry.category("actions").add(`majal_suite_ui.workspace.${key}`, MajalWorkspaceHub);
    }
}
