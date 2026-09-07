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
            // Which phases are folded away, by task id. Everything starts
            // open: a programme that hides itself on load is a programme
            // somebody has to unfold before they can read it.
            collapsed: {},
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
                    "project_id", "parent_id",
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

    // ------------------------------------------------------------------
    // Hierarchy
    //
    // The programme was a flat list ordered by wbs_code, so a fifty-line
    // schedule read as fifty peers and the phases were implied by nothing
    // but the numbering. The tree is derived from wbs_code rather than from
    // parent_id on purpose: nothing in this module populates parent_id — the
    // demo data included — while every task already carries a code like
    // "1.1" or "2.M". A tree built on the field nobody fills in would be a
    // flat list with extra machinery.
    //
    // parent_id is still read, as the fallback for a task with no code at
    // all, so those nest under their parent instead of all piling up at the
    // root.
    // ------------------------------------------------------------------

    /** The code of the row this one sits under, or null at the top. */
    parentWbsOf(wbs) {
        if (!wbs) {
            return null;
        }
        const cut = wbs.lastIndexOf(".");
        return cut === -1 ? null : wbs.slice(0, cut);
    }

    /**
     * Order two WBS codes the way a planner reads them.
     *
     * Segment by segment, numerically where the segment is a number. The
     * server orders by wbs_code as a string, which puts "10.1" before "2.1"
     * and "1.10" before "1.2" — wrong on any programme that reaches ten of
     * anything, and wrong in a way that looks like a data problem rather
     * than a sort problem.
     */
    compareWbs(left, right) {
        const a = (left || "").split(".");
        const b = (right || "").split(".");
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const x = a[i];
            const y = b[i];
            if (x === undefined) {
                return -1;
            }
            if (y === undefined) {
                return 1;
            }
            const nx = Number(x);
            const ny = Number(y);
            // "2.M" is a milestone marker in this data, so a segment is not
            // always a number and the comparison has to cope with both.
            const numeric = !Number.isNaN(nx) && !Number.isNaN(ny)
                && x.trim() !== "" && y.trim() !== "";
            const cmp = numeric ? nx - ny : String(x).localeCompare(String(y));
            if (cmp) {
                return cmp;
            }
        }
        return 0;
    }

    /**
     * Real tasks, plus a summary row for every phase the codes imply but
     * nobody created.
     *
     * This is the part that decides whether the tree is worth having. The
     * demo programme numbers its tasks 1.1, 1.2, 2.1, 2.M and contains no
     * task numbered 1 or 2 — and neither does any real programme in this
     * database. A tree that only nests under parents somebody remembered to
     * create is a flat list on every project that exists.
     *
     * So the phases are derived from the numbering instead. A synthesised
     * row spans its descendants, carries their worst slip and their tightest
     * float, and is marked as critical when any work inside it is. It is not
     * a task: it has a string id, it cannot be opened, and it is styled as a
     * summary so nobody mistakes it for something they can edit.
     */
    get displayTasks() {
        const real = this.state.tasks;
        const present = new Set(real.map((task) => task.wbs_code).filter(Boolean));
        const missing = new Set();
        for (const task of real) {
            let wbs = this.parentWbsOf(task.wbs_code);
            while (wbs) {
                if (!present.has(wbs)) {
                    missing.add(wbs);
                }
                wbs = this.parentWbsOf(wbs);
            }
        }
        if (!missing.size) {
            return [...real].sort(
                (a, b) => this.compareWbs(a.wbs_code, b.wbs_code));
        }

        const synthetic = [];
        for (const code of missing) {
            const under = real.filter(
                (task) => (task.wbs_code || "").startsWith(code + "."));
            if (!under.length) {
                continue;
            }
            const starts = under.map((t) => t.planned_start).filter(Boolean).sort();
            const finishes = under.map((t) => t.planned_finish).filter(Boolean).sort();
            synthetic.push({
                // A string id, so it can never collide with a task id and
                // openTask can refuse it without guessing.
                id: `phase:${code}`,
                name: this.phaseLabel(code, under),
                wbs_code: code,
                planned_start: starts[0],
                planned_finish: finishes[finishes.length - 1],
                baseline_start: false,
                baseline_finish: false,
                // The worst slip inside it, because a phase is on time only
                // when everything in it is.
                finish_variance_days: Math.max(
                    0, ...under.map((t) => t.finish_variance_days || 0)),
                progress: this.phaseProgress(under),
                is_critical: under.some((t) => t.is_critical),
                is_milestone: false,
                total_float: Math.min(...under.map((t) => t.total_float || 0)),
                synthetic: true,
            });
        }
        return [...real, ...synthetic].sort(
            (a, b) => this.compareWbs(a.wbs_code, b.wbs_code));
    }

    /** What to call a phase nobody named. */
    phaseLabel(code, under) {
        // The code is all that is actually known. Saying so is better than
        // inventing a name, and better than leaving the row blank — a row
        // with no label reads as a rendering fault.
        return _t("Phase %s", code);
    }

    /**
     * Duration-weighted, not a plain average.
     *
     * A phase holding a two-day task at 100% and a sixty-day task at 0% is
     * not half done, and reporting it that way is how a programme review
     * goes quiet for a month.
     */
    phaseProgress(under) {
        let weighted = 0;
        let total = 0;
        for (const task of under) {
            const start = parseServerDate(task.planned_start);
            const finish = parseServerDate(task.planned_finish);
            const days = start && finish
                ? Math.max(1, (finish - start) / 86400000)
                : 1;
            weighted += days * Math.min(Math.max(task.progress || 0, 0), 100);
            total += days;
        }
        return total ? weighted / total : 0;
    }

    /**
     * Parent, depth and child-count for every task, in one pass.
     *
     * Built once per render rather than answered per row on demand. The
     * obvious shape — a parentOf(task) helper the template calls — rebuilds
     * the code index on every call, and hasChildren then calls it once per
     * task per task. At the 400-task limit this loader already sets, that is
     * tens of millions of operations to draw one chart.
     */
    get hierarchy() {
        const tasks = this.displayTasks;
        const byWbs = new Map();
        const byId = new Map();
        for (const task of tasks) {
            byId.set(task.id, task);
            if (task.wbs_code) {
                byWbs.set(task.wbs_code, task);
            }
        }

        const parent = new Map();
        for (const task of tasks) {
            let found = null;
            // Walk up past codes that are not on screen — "1.2.1" whose
            // "1.2" the critical-path filter removed still belongs under a
            // visible "1" rather than vanishing with its parent.
            let wbs = this.parentWbsOf(task.wbs_code);
            while (wbs && !found) {
                found = byWbs.get(wbs) || null;
                wbs = this.parentWbsOf(wbs);
            }
            if (!found && !task.wbs_code && task.parent_id) {
                found = byId.get(task.parent_id[0]) || null;
            }
            // A code cannot be its own ancestor, but data can say anything.
            parent.set(task.id, found && found.id !== task.id ? found : null);
        }

        const childCount = new Map();
        for (const task of tasks) {
            const above = parent.get(task.id);
            if (above) {
                childCount.set(above.id, (childCount.get(above.id) || 0) + 1);
            }
        }

        const depth = new Map();
        const hidden = new Set();
        for (const task of tasks) {
            let level = 0;
            let above = parent.get(task.id);
            // Bounded, so a cycle the data should not contain draws a wrong
            // chart rather than hanging the browser.
            while (above && level < 12) {
                if (this.state.collapsed[above.id]) {
                    hidden.add(task.id);
                }
                level += 1;
                above = parent.get(above.id);
            }
            depth.set(task.id, level);
        }

        return { tasks, depth, childCount, hidden };
    }

    toggleRow(taskId) {
        this.state.collapsed = {
            ...this.state.collapsed,
            [taskId]: !this.state.collapsed[taskId],
        };
    }

    /** Rows enriched with everything the template needs to draw. */
    get rows() {
        const { tasks, depth, childCount, hidden } = this.hierarchy;
        return tasks.filter((task) => !hidden.has(task.id)).map((task) => {
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
                depth: depth.get(task.id) || 0,
                synthetic: Boolean(task.synthetic),
                hasChildren: Boolean(childCount.get(task.id)),
                collapsed: Boolean(this.state.collapsed[task.id]),
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
        // A synthesised phase is not a record. Its id is a string, so this
        // recognises it without having to be told, and folding the phase is
        // what a click on it should do instead.
        if (typeof taskId !== "number") {
            this.toggleRow(taskId);
            return;
        }
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
