/**
 * Two revisions of the same sheet, side by side.
 *
 * Nothing existed for drawings: a reviewer asking "what changed at Rev C"
 * opened two PDFs in two browser tabs and alt-tabbed between them.
 *
 * Deliberately two panes and not a computed diff. A drawing is a picture,
 * and what changed on it is something an engineer sees in a second. A pixel
 * comparison of two independently generated PDFs does not see it: the same
 * sheet replotted shifts every line by a fraction and the whole page lights
 * up as changed, which is worse than no answer because it looks like one.
 *
 * Zoom and page are shared across both panes, and the two scroll together.
 * That is the whole trick — two sheets at different scales or on different
 * pages are two pictures, not a comparison.
 */

import { Component, onWillStart, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadPDFJSAssets } from "@web/libs/pdfjs";

const WORKER_SRC = "/web/static/lib/pdfjs/build/pdf.worker.js";
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;

export class RevisionCompare extends Component {
    static template = "construction_drawing.RevisionCompare";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.action = useService("action");

        const params = this.props.action.params || this.props.action.context || {};
        this.leftCanvas = useRef("leftCanvas");
        this.rightCanvas = useRef("rightCanvas");
        this.leftPane = useRef("leftPane");
        this.rightPane = useRef("rightPane");

        this.state = useState({
            loading: true,
            error: false,
            drawing: null,
            revisions: [],
            leftId: params.left_id || false,
            rightId: params.right_id || false,
            scale: 1,
            page: 1,
            pageCount: 1,
            syncScroll: true,
        });

        this.drawingId = params.drawing_id || false;
        // Render passes are numbered so a slow first PDF cannot paint over
        // the sheet the user has since switched to.
        this._seq = { left: 0, right: 0 };

        onWillStart(async () => {
            await loadPDFJSAssets();
            await this.load();
        });
    }

    get pdfjs() {
        return globalThis.pdfjsLib;
    }

    async load() {
        this.state.loading = true;
        try {
            const data = await this.orm.call(
                "construction.drawing.revision", "get_compare_data",
                [this.drawingId]);
            this.state.drawing = data.drawing;
            this.state.revisions = data.revisions;
            if (!this.state.rightId && data.revisions.length) {
                this.state.rightId = data.revisions[0].id;
            }
            if (!this.state.leftId && data.revisions.length > 1) {
                this.state.leftId = data.revisions[1].id;
            }
        } catch {
            this.state.error = true;
        } finally {
            this.state.loading = false;
        }
        await this.renderBoth({ fit: true });
    }

    revisionOf(id) {
        return this.state.revisions.find((item) => item.id === id) || null;
    }

    get leftRevision() {
        return this.revisionOf(this.state.leftId);
    }

    get rightRevision() {
        return this.revisionOf(this.state.rightId);
    }

    /**
     * Whether the two panes are showing the same sheet.
     *
     * Worth saying out loud on screen: a reviewer who has both pickers on
     * Rev C and sees no differences has learnt nothing, and has no way to
     * tell that from a revision that genuinely changed nothing.
     */
    get comparingSameRevision() {
        return Boolean(this.state.leftId) && this.state.leftId === this.state.rightId;
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    async renderPane(side, { fit = false } = {}) {
        const revision = side === "left" ? this.leftRevision : this.rightRevision;
        const canvasRef = side === "left" ? this.leftCanvas : this.rightCanvas;
        const paneRef = side === "left" ? this.leftPane : this.rightPane;
        const canvas = canvasRef.el;
        if (!canvas) {
            return;
        }
        if (!revision || !revision.attachment_id || !this.pdfjs) {
            // Clear rather than leave the previous sheet showing: a stale
            // drawing under a new revision label is a wrong answer.
            canvas.width = 0;
            canvas.height = 0;
            return;
        }
        const seq = ++this._seq[side];
        try {
            this.pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
            const pdf = await this.pdfjs.getDocument(
                `/web/content/${revision.attachment_id}`).promise;
            if (seq !== this._seq[side]) {
                return;
            }
            // Page count is the smaller of the two, since a page that only
            // one side has cannot be compared with anything.
            const page = await pdf.getPage(Math.min(this.state.page, pdf.numPages));
            if (seq !== this._seq[side]) {
                return;
            }
            if (fit && paneRef.el) {
                const base = page.getViewport({ scale: 1 });
                const available = paneRef.el.clientWidth - 24;
                if (available > 100) {
                    this.state.scale = Math.min(
                        2, Math.max(MIN_SCALE, available / base.width));
                }
            }
            const viewport = page.getViewport({ scale: this.state.scale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
                canvasContext: canvas.getContext("2d"), viewport,
            }).promise;
            return pdf.numPages;
        } catch (error) {
            this.notification.add(
                _t("Could not render %s.", revision.label),
                { type: "danger" });
            console.error(error);
        }
    }

    async renderBoth(options = {}) {
        // Left first and then right, rather than in parallel: both write
        // this.state.scale when fitting, and two concurrent fits race to
        // decide it, which shows as the panes settling at different sizes.
        const left = await this.renderPane("left", options);
        const right = await this.renderPane("right", options);
        const counts = [left, right].filter(Boolean);
        this.state.pageCount = counts.length ? Math.min(...counts) : 1;
        if (this.state.page > this.state.pageCount) {
            this.state.page = this.state.pageCount;
        }
    }

    // ------------------------------------------------------------------
    // Controls
    // ------------------------------------------------------------------
    async onSelect(side, ev) {
        const id = parseInt(ev.target.value, 10) || false;
        if (side === "left") {
            this.state.leftId = id;
        } else {
            this.state.rightId = id;
        }
        await this.renderBoth();
    }

    async zoom(delta) {
        this.state.scale = Math.min(
            MAX_SCALE, Math.max(MIN_SCALE, this.state.scale + delta));
        await this.renderBoth();
    }

    async fit() {
        await this.renderBoth({ fit: true });
    }

    async setPage(page) {
        const next = Math.min(this.state.pageCount, Math.max(1, page));
        if (next === this.state.page) {
            return;
        }
        this.state.page = next;
        await this.renderBoth();
    }

    toggleSync() {
        this.state.syncScroll = !this.state.syncScroll;
    }

    /** Mirror one pane's scroll onto the other. */
    onScroll(side) {
        if (!this.state.syncScroll || this._mirroring) {
            return;
        }
        const from = side === "left" ? this.leftPane.el : this.rightPane.el;
        const to = side === "left" ? this.rightPane.el : this.leftPane.el;
        if (!from || !to) {
            return;
        }
        // Without this guard each pane's scroll fires the other's handler
        // and the two fight each other into a stutter.
        this._mirroring = true;
        to.scrollTop = from.scrollTop;
        to.scrollLeft = from.scrollLeft;
        // A frame, not a timeout: the mirrored scroll event lands before
        // the next paint.
        globalThis.requestAnimationFrame(() => {
            this._mirroring = false;
        });
    }

    openRevision(id) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "construction.drawing.revision",
            res_id: id,
            views: [[false, "form"]],
        });
    }
}

registry.category("actions").add("construction_revision_compare", RevisionCompare);
