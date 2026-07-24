/** @odoo-module **/

import { Component, useRef, useState, onWillStart, onMounted } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadPDFJSAssets } from "@web/libs/pdfjs";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

const WORKER_SRC = "/web/static/lib/pdfjs/build/pdf.worker.js";

/**
 * Small modal asking for the new pin's type + label before it is created.
 */
export class PinPromptDialog extends Component {
    static template = "construction_pin.PinPromptDialog";
    static components = { Dialog };
    static props = { close: Function, confirm: Function };

    setup() {
        this.state = useState({ pinType: "task", name: "", description: "" });
    }
    onConfirm() {
        if (!this.state.name.trim()) {
            return;
        }
        this.props.confirm({ ...this.state });
        this.props.close();
    }
}

/**
 * Fieldwire/PlanRadar-style plan viewer: renders a drawing sheet PDF on a
 * canvas and overlays status-coloured pins linked to tasks / RFIs / notes.
 */
export class PlanViewer extends Component {
    static template = "construction_pin.PlanViewer";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.canvasRef = useRef("canvas");
        const params = this.props.action.params || this.props.action.context || {};
        this.state = useState({
            revisionId: params.revision_id || false,
            revisions: [],
            projectName: "",
            revisionLabel: "",
            pins: [],
            addMode: false,
            newPinType: "task",
            scale: 1.2,
            loading: true,
            hasSheet: false,
        });

        onWillStart(async () => {
            await loadPDFJSAssets();
            if (this.state.revisionId) {
                await this.loadData();
            } else {
                this.state.loading = false;
            }
        });
        onMounted(() => this.renderPdf());
    }

    get pdfjs() {
        return globalThis.pdfjsLib;
    }

    async loadData() {
        this.state.loading = true;
        const data = await this.orm.call(
            "construction.pin",
            "get_plan_data",
            [this.state.revisionId]
        );
        this.state.projectName = data.revision.project_name;
        this.state.revisionLabel = data.revision.label;
        this.state.revisions = data.revisions;
        this.state.pins = data.pins;
        this.attachmentId = data.revision.attachment_id;
        this.state.hasSheet = Boolean(this.attachmentId);
        this.state.loading = false;
    }

    async renderPdf() {
        if (!this.attachmentId || !this.pdfjs || !this.canvasRef.el) {
            return;
        }
        try {
            this.pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
            const pdf = await this.pdfjs.getDocument(
                `/web/content/${this.attachmentId}`
            ).promise;
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: this.state.scale });
            const canvas = this.canvasRef.el;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport,
            }).promise;
        } catch (error) {
            this.notification.add(
                _t("Could not render the drawing sheet PDF."),
                { type: "danger" }
            );
            console.error(error);
        }
    }

    async onSelectRevision(ev) {
        this.state.revisionId = parseInt(ev.target.value, 10);
        await this.loadData();
        await this.renderPdf();
    }

    async zoom(delta) {
        this.state.scale = Math.min(4, Math.max(0.4, this.state.scale + delta));
        await this.renderPdf();
    }

    toggleAddMode() {
        this.state.addMode = !this.state.addMode;
    }

    async onSheetClick(ev) {
        if (!this.state.addMode) {
            return;
        }
        const rect = ev.currentTarget.getBoundingClientRect();
        const posX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        const posY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
        this.dialog.add(PinPromptDialog, {
            confirm: async (vals) => {
                const pin = await this.orm.call(
                    "construction.pin",
                    "create_pin_with_target",
                    [
                        this.state.revisionId,
                        posX,
                        posY,
                        vals.pinType,
                        vals.name,
                        vals.description,
                    ]
                );
                this.state.pins = [...this.state.pins, pin];
                this.state.addMode = false;
            },
        });
    }

    async onPinClick(pin, ev) {
        ev.stopPropagation();
        const targetModel = pin.pin_type === "task" ? "project.task"
            : pin.pin_type === "rfi" ? "construction.rfi" : false;
        const targetId = pin.pin_type === "task" ? pin.task_id?.[0]
            : pin.pin_type === "rfi" ? pin.rfi_id?.[0] : false;
        if (!targetModel || !targetId) {
            this.notification.add(pin.name, { type: "info" });
            return;
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: targetModel,
            res_id: targetId,
            view_mode: "form",
            views: [[false, "form"]],
            target: "current",
        });
    }

    pinStyle(pin) {
        return `left:${pin.pos_x * 100}%; top:${pin.pos_y * 100}%;`;
    }

    pinColorClass(pin) {
        return `o_pin_color_${pin.color || 0}`;
    }
}

registry.category("actions").add("construction_plan_viewer", PlanViewer);
