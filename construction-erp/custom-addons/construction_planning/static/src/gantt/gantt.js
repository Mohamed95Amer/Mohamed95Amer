/** @odoo-module **/

import { Component, onWillStart, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const DAY_MS = 24 * 60 * 60 * 1000;

// Pixels per day at each zoom. Day view is for look-ahead planning on a short
// window; quarter is for showing a client the whole job on one screen.
const ZOOMS = {
    day: { label: "Day", px: 34, tick: "day" },
    week: { label: "Week", px: 12, tick: "week" },
    month: { label: "Month", px: 4.2, tick: "month" },
    quarter: { label: "Quarter", px: 1.6, tick: "month" },
};

const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const parseServerDate = (value) => (value ? new Date(value.replace(" ", "T") + "Z") : null);

/**
 * Programme Gantt.
 *
 * The OCA timeline this replaces could draw a bar and an arrow, but not the
 * thing a planner actually opens a programme to see: whether the job is
 * slipping. The CPM engine already stores a baseline, total float and the
 * critical path, and none of it was visible. Here each activity draws its
 * current bar over a baseline shadow, so drift shows as the offset between
 * them, and the critical path — where drift costs the completion date — is
 * coloured separately from work that has float to absorb it.
 */
export class ProgrammeGantt extends Component {
    static template = "construction_planning.ProgrammeGantt";
    static props = {
        action: { type: Object, optional: true },
        actionId: { type: [Number, Boolean], optional: true },
        className: { type: String, optional: true },
        updateActionState: { type: Function, optional: true },
    };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.scrollerRef = useRef("scroller");

        this.state = useState({
            loading: true,
            error: false,
            projects: [],
            projectId: null,
            zoom: "week",
            showBaseline: true,
            criticalOnly: false,
            tasks: [],
        });

        onWillStart(async () => {
            await this.loadProjects();
            await this.loadTasks();
        });
    }

    async loadProjects() {
        this.state.projects = await this.orm.searchRead(
            "project.project",
            [["is_construction", "=", true]],
            ["name"],
            { order: "name" }
        );
        if (this.state.projects.length) {
            this.state.projectId = this.state.projects[0].id;
        }
    }

    async loadTasks() {
        this.state.loading = true;
        this.state.error = false;
        try {
            const domain = [["project_id.is_construction", "=", true]];
            if (this.state.projectId) {
                domain.push(["project_id", "=", this.state.projectId]);
            }
            if (this.state.criticalOnly) {
                domain.push(["is_critical", "=", true]);
            }
            const tasks = await this.orm.searchRead(
                "project.task",
                domain,
                [
                    "name", "wbs_code", "planned_start", "planned_finish",
                    "baseline_start", "baseline_finish", "finish_variance_days",
                    "progress", "is_critical", "is_milestone", "total_float",
                    "project_id",
                ],
                { limit: 400, order: "wbs_code, planned_start, id" }
            );
            this.state.tasks = tasks.filter((t) => t.planned_start && t.planned_finish);
        } catch {
            this.state.error = true;
        } finally {
            this.state.loading = false;
        }
    }

    async onProjectChange(ev) {
        this.state.projectId = parseInt(ev.target.value, 10) || null;
        await this.loadTasks();
    }

    async toggleCriticalOnly() {
        this.state.criticalOnly = !this.state.criticalOnly;
        await this.loadTasks();
    }

    setZoom(zoom) {
        this.state.zoom = zoom;
    }

    toggleBaseline() {
        this.state.showBaseline = !this.state.showBaseline;
    }

    // ------------------------------------------------------------------
    // Geometry
    // ------------------------------------------------------------------
    get pxPerDay() {
        return ZOOMS[this.state.zoom].px;
    }

    get zoomOptions() {
        return Object.entries(ZOOMS).map(([key, cfg]) => ({ key, label: _t(cfg.label) }));
    }

    /** Window spanning every bar plus its baseline, padded for readability. */
    get window() {
        const dates = [];
        for (const task of this.state.tasks) {
            for (const key of ["planned_start", "planned_finish", "baseline_start", "baseline_finish"]) {
                const parsed = parseServerDate(task[key]);
                if (parsed) {
                    dates.push(parsed.getTime());
                }
            }
        }
        const today = startOfDay(new Date()).getTime();
        dates.push(today);
        const min = startOfDay(new Date(Math.min(...dates) - 3 * DAY_MS));
        const max = startOfDay(new Date(Math.max(...dates) + 5 * DAY_MS));
        return { min, max };
    }

    get chartWidth() {
        const { min, max } = this.window;
        return Math.max(((max - min) / DAY_MS) * this.pxPerDay, 320);
    }

    offsetOf(value) {
        const parsed = parseServerDate(value);
        if (!parsed) {
            return null;
        }
        return ((startOfDay(parsed) - this.window.min) / DAY_MS) * this.pxPerDay;
    }

    widthBetween(start, end) {
        const from = parseServerDate(start);
        const to = parseServerDate(end);
        if (!from || !to) {
            return 0;
        }
        // A one-day activity must still be visible, hence the floor.
        const days = Math.max((startOfDay(to) - startOfDay(from)) / DAY_MS, 0) + 1;
        return Math.max(days * this.pxPerDay, 3);
    }

    get todayOffset() {
        return this.offsetOf(new Date().toISOString().slice(0, 19).replace("T", " "));
    }

    /** Column headers for the current zoom. */
    get ticks() {
        const { min, max } = this.window;
        const mode = ZOOMS[this.state.zoom].tick;
        const out = [];
        const cursor = new Date(min);
        if (mode === "week") {
            cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
        } else if (mode === "month") {
            cursor.setDate(1);
        }
        while (cursor <= max) {
            const offset = ((startOfDay(cursor) - min) / DAY_MS) * this.pxPerDay;
            out.push({
                key: cursor.toISOString().slice(0, 10),
                offset,
                label: this.tickLabel(cursor, mode),
            });
            if (mode === "day") {
                cursor.setDate(cursor.getDate() + 1);
            } else if (mode === "week") {
                cursor.setDate(cursor.getDate() + 7);
            } else {
                cursor.setMonth(cursor.getMonth() + 1);
            }
        }
        return out;
    }

    tickLabel(date, mode) {
        if (mode === "day") {
            return `${date.getDate()}`;
        }
        if (mode === "week") {
            return `${date.getDate()}/${date.getMonth() + 1}`;
        }
        return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    }

    /** Rows enriched with everything the template needs to draw. */
    get rows() {
        return this.state.tasks.map((task) => {
            const left = this.offsetOf(task.planned_start) || 0;
            const width = this.widthBetween(task.planned_start, task.planned_finish);
            const baselineLeft = this.offsetOf(task.baseline_start);
            const baselineWidth = task.baseline_start && task.baseline_finish
                ? this.widthBetween(task.baseline_start, task.baseline_finish)
                : 0;
            const variance = task.finish_variance_days || 0;
            return {
                id: task.id,
                name: task.name,
                wbs: task.wbs_code || "",
                isCritical: task.is_critical,
                isMilestone: task.is_milestone,
                float: task.total_float || 0,
                progress: Math.min(Math.max(task.progress || 0, 0), 100),
                left,
                width,
                baselineLeft,
                baselineWidth,
                hasBaseline: Boolean(baselineLeft !== null && baselineWidth),
                variance,
                slipping: variance > 0,
                tooltip: this.tooltipFor(task, variance),
            };
        });
    }

    tooltipFor(task, variance) {
        const parts = [task.name];
        if (task.wbs_code) {
            parts.push(_t("WBS %s", task.wbs_code));
        }
        parts.push(
            `${(task.planned_start || "").slice(0, 10)} → ${(task.planned_finish || "").slice(0, 10)}`
        );
        if (task.is_critical) {
            parts.push(_t("On the critical path"));
        } else {
            parts.push(_t("Float: %s working days", task.total_float || 0));
        }
        if (variance > 0) {
            parts.push(_t("Slipped %s working days behind baseline", variance));
        } else if (variance < 0) {
            parts.push(_t("Ahead of baseline by %s working days", Math.abs(variance)));
        }
        parts.push(_t("%s%% complete", Math.round(task.progress || 0)));
        return parts.join(" · ");
    }

    /** Headline numbers, so the programme states its own health. */
    get summary() {
        const rows = this.rows;
        const slipping = rows.filter((r) => r.slipping);
        const worst = slipping.reduce((acc, r) => Math.max(acc, r.variance), 0);
        return {
            total: rows.length,
            critical: rows.filter((r) => r.isCritical).length,
            slipping: slipping.length,
            worst,
            milestones: rows.filter((r) => r.isMilestone).length,
            complete: rows.filter((r) => r.progress >= 100).length,
        };
    }

    openTask(taskId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "project.task",
            res_id: taskId,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

registry.category("actions").add("construction_planning.gantt", ProgrammeGantt);
