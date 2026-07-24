/** @odoo-module **/

import {
    Component,
    useRef,
    useState,
    onWillStart,
    onMounted,
    useExternalListener,
} from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadPDFJSAssets } from "@web/libs/pdfjs";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

const WORKER_SRC = "/web/static/lib/pdfjs/build/pdf.worker.js";

// Fallback shown before the server list loads; the real list (including
// modules like construction_defect) comes from get_plan_data.
const FALLBACK_TYPES = [
    { id: "task", label: _t("Task"), icon: "fa-wrench" },
    { id: "rfi", label: _t("RFI"), icon: "fa-question" },
    { id: "note", label: _t("Note"), icon: "fa-sticky-note" },
];

/**
 * Modal asking for the new pin's type + label before it is created.
 */
export class PinPromptDialog extends Component {
    static template = "construction_pin.PinPromptDialog";
    static components = { Dialog };
    static props = { close: Function, confirm: Function, pinTypes: Array };

    setup() {
        this.pinTypes = this.props.pinTypes;
        this.state = useState({
            pinType: this.props.pinTypes[0]?.id || "note",
            name: "",
            description: "",
        });
    }
    selectType(typeId) {
        this.state.pinType = typeId;
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
        this.scrollRef = useRef("scroll");
        this.fileInputRef = useRef("fileInput");
        const params = this.props.action.params || this.props.action.context || {};
        this.state = useState({
            revisionId: params.revision_id || false,
            revisions: [],
            projectName: "",
            revisionLabel: "",
            pins: [],
            pinTypes: FALLBACK_TYPES,
            addMode: false,
            scale: 1.2,
            loading: true,
            uploading: false,
            hasSheet: false,
            filters: {},
        });
        this._renderSeq = 0;

        useExternalListener(window, "keydown", (ev) => {
            if (ev.key === "Escape" && this.state.addMode) {
                this.state.addMode = false;
            }
        });

        onWillStart(async () => {
            await loadPDFJSAssets();
            if (this.state.revisionId) {
                await this.loadData();
            } else {
                this.state.loading = false;
            }
        });
        onMounted(() => this.renderPdf({ fit: true }));
    }

    get pdfjs() {
        return globalThis.pdfjsLib;
    }

    get visiblePins() {
        return this.state.pins.filter(
            (pin) => this.state.filters[pin.pin_type] !== false
        );
    }

    pinCount(typeId) {
        return this.state.pins.filter((p) => p.pin_type === typeId).length;
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
        if (data.pin_types?.length) {
            this.state.pinTypes = data.pin_types;
        }
        const filters = {};
        for (const type of this.state.pinTypes) {
            filters[type.id] = this.state.filters[type.id] !== false;
        }
        this.state.filters = filters;
        this.attachmentId = data.revision.attachment_id;
        this.state.hasSheet = Boolean(this.attachmentId);
        this.state.loading = false;
    }

    async renderPdf({ fit = false } = {}) {
        if (!this.attachmentId || !this.pdfjs || !this.canvasRef.el) {
            return;
        }
        const seq = ++this._renderSeq;
        try {
            this.pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
            const pdf = await this.pdfjs.getDocument(
                `/web/content/${this.attachmentId}`
            ).promise;
            const page = await pdf.getPage(1);
            if (seq !== this._renderSeq) {
                return; // a newer render started meanwhile
            }
            if (fit && this.scrollRef.el) {
                const base = page.getViewport({ scale: 1 });
                const available = this.scrollRef.el.clientWidth - 48;
                if (available > 100) {
                    this.state.scale = Math.min(
                        3, Math.max(0.4, available / base.width)
                    );
                }
            }
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
        await this.renderPdf({ fit: true });
    }

    async zoom(delta) {
        this.state.scale = Math.min(4, Math.max(0.4, this.state.scale + delta));
        await this.renderPdf();
    }

    async fitWidth() {
        await this.renderPdf({ fit: true });
    }

    toggleAddMode() {
        this.state.addMode = !this.state.addMode;
    }

    toggleFilter(typeId) {
        this.state.filters[typeId] = !this.state.filters[typeId];
    }

    // ------------------------------------------------------------------
    // Sheet upload
    // ------------------------------------------------------------------
    triggerUpload() {
        this.fileInputRef.el?.click();
    }

    async onFileSelected(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = "";
        if (!file) {
            return;
        }
        if (!/\.pdf$/i.test(file.name)) {
            this.notification.add(_t("Please choose a PDF file."), {
                type: "warning",
            });
            return;
        }
        this.state.uploading = true;
        try {
            const dataB64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                    resolve(reader.result.toString().split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const result = await this.orm.call(
                "construction.drawing.revision",
                "upload_sheet",
                [this.state.revisionId, file.name, dataB64]
            );
            this.attachmentId = result.attachment_id;
            this.state.hasSheet = true;
            this.notification.add(_t("Sheet uploaded."), { type: "success" });
            await this.renderPdf({ fit: true });
        } catch (error) {
            this.notification.add(
                _t("Upload failed — is the file a valid PDF?"),
                { type: "danger" }
            );
            console.error(error);
        } finally {
            this.state.uploading = false;
        }
    }

    // ------------------------------------------------------------------
    // Pins
    // ------------------------------------------------------------------
    async onSheetClick(ev) {
        if (!this.state.addMode) {
            return;
        }
        const rect = ev.currentTarget.getBoundingClientRect();
        const posX = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        const posY = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
        this.dialog.add(PinPromptDialog, {
            pinTypes: this.state.pinTypes,
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
                this.notification.add(_t("Pin created."), { type: "success" });
            },
        });
    }

    async onPinClick(pin, ev) {
        ev.stopPropagation();
        const action = await this.orm.call(
            "construction.pin", "action_open_target", [pin.id]
        );
        if (!action) {
            this.notification.add(pin.name, { type: "info" });
            return;
        }
        this.action.doAction(
            { ...action, target: "new", views: [[false, "form"]] }
        );
    }

    pinStyle(pin) {
        return `left:${pin.pos_x * 100}%; top:${pin.pos_y * 100}%;`;
    }

    pinClass(pin) {
        const bucket = pin.status_bucket || "info";
        return `o_plan_pin o_pin--${bucket}`;
    }

    pinIcon(pin) {
        const type = this.state.pinTypes.find((t) => t.id === pin.pin_type);
        return `fa ${type ? type.icon : "fa-map-marker"}`;
    }
}

registry.category("actions").add("construction_plan_viewer", PlanViewer);
