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

// Mirrors construction_pin.max_photo_mb on the server. Checked in both
// places on purpose: the server decides, the browser saves the upload.
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

// Fallback shown before the server list loads.
const FALLBACK_TYPES = [
    { id: "note", label: _t("Note"), icon: "fa-sticky-note" },
];

/** Modal asking for the new pin's type + label before it is created. */
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
            photo: null,          // base64 payload sent to the server
            photoPreview: null,   // data URL, only for the thumbnail
            photoError: null,
        });
    }
    selectType(typeId) {
        this.state.pinType = typeId;
    }

    /**
     * Read the chosen picture once, keep the base64 for the RPC and a data
     * URL for the preview.
     *
     * The size is checked here as well as on the server. The server check is
     * the one that counts — this one exists so a site engineer on a slow
     * connection is told immediately rather than after uploading twelve
     * megabytes to be refused.
     */
    async onPhotoSelected(ev) {
        const file = ev.target.files?.[0];
        this.state.photoError = null;
        if (!file) {
            this.clearPhoto();
            return;
        }
        if (!file.type.startsWith("image/")) {
            this.state.photoError = _t("That file is not an image.");
            ev.target.value = "";
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            this.state.photoError = _t(
                "That photo is larger than %sMB.", MAX_PHOTO_BYTES / 1048576);
            ev.target.value = "";
            return;
        }
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        this.state.photoPreview = dataUrl;
        this.state.photo = dataUrl.split(",")[1] || null;
    }

    clearPhoto() {
        this.state.photo = null;
        this.state.photoPreview = null;
        this.state.photoError = null;
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
 * Generic pin-on-plan viewer. Driven by any model implementing the pin RPCs
 * (get_plan_data / create_pin_with_target / action_open_target) — construction
 * drawing pins, facility floor-plan pins, … — selected via action params
 * `pin_model`, `sheet_model` and `sheet_id`.
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
        this.pinModel = params.pin_model || "construction.pin";
        this.sheetModel = params.sheet_model || "construction.drawing.revision";
        this.state = useState({
            sheetId: params.sheet_id || params.revision_id || false,
            sheets: [],
            contextName: "",
            sheetLabel: "",
            pins: [],
            pinTypes: FALLBACK_TYPES,
            addMode: false,
            scale: 1.2,
            loading: true,
            uploading: false,
            hasSheet: false,
            renderError: false,
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
            if (this.state.sheetId) {
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
            (pin) => this.state.filters[pin.pin_type] !== false);
    }

    /**
     * Where to fetch a pin's photograph.
     *
     * /web/image runs the record's own access rules, so a user who may not
     * read the pin does not get the picture either — which is why the image
     * is served this way rather than shipped inside the pin payload.
     */
    photoUrl(pin) {
        return `/web/image/${this.pinModel}/${pin.id}/photo`;
    }

    pinCount(typeId) {
        return this.state.pins.filter((p) => p.pin_type === typeId).length;
    }

    async loadData() {
        this.state.loading = true;
        this.state.renderError = false;
        try {
            const data = await this.orm.call(
                this.pinModel, "get_plan_data", [this.state.sheetId]);
            this.state.contextName = data.sheet.context_name;
            this.state.sheetLabel = data.sheet.label;
            this.state.sheets = data.sheets;
            this.state.pins = data.pins;
            if (data.pin_types?.length) {
                this.state.pinTypes = data.pin_types;
            }
            const filters = {};
            for (const type of this.state.pinTypes) {
                filters[type.id] = this.state.filters[type.id] !== false;
            }
            this.state.filters = filters;
            this.attachmentId = data.sheet.attachment_id;
            this.state.hasSheet = Boolean(this.attachmentId);
        } catch (error) {
            this.state.renderError = _t(
                "The plan data could not be loaded. Check your access and try again."
            );
            console.error(error);
        } finally {
            this.state.loading = false;
        }
    }

    async renderPdf({ fit = false } = {}) {
        if (!this.attachmentId || !this.pdfjs || !this.canvasRef.el) {
            return;
        }
        const seq = ++this._renderSeq;
        this.state.renderError = false;
        try {
            this.pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
            const pdf = await this.pdfjs.getDocument(
                `/web/content/${this.attachmentId}`).promise;
            const page = await pdf.getPage(1);
            if (seq !== this._renderSeq) {
                return;
            }
            if (fit && this.scrollRef.el) {
                const base = page.getViewport({ scale: 1 });
                const available = this.scrollRef.el.clientWidth - 48;
                if (available > 100) {
                    this.state.scale = Math.min(
                        3, Math.max(0.4, available / base.width));
                }
            }
            const viewport = page.getViewport({ scale: this.state.scale });
            const canvas = this.canvasRef.el;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
                canvasContext: canvas.getContext("2d"), viewport,
            }).promise;
        } catch (error) {
            this.state.renderError = _t(
                "The PDF sheet could not be displayed. Replace it with a valid PDF or try again."
            );
            this.notification.add(_t("Could not render the sheet PDF."),
                { type: "danger" });
            console.error(error);
        }
    }

    async retryRender() {
        await this.loadData();
        await this.renderPdf({ fit: true });
    }

    async onSelectSheet(ev) {
        this.state.sheetId = parseInt(ev.target.value, 10);
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
            this.notification.add(_t("Please choose a PDF file."),
                { type: "warning" });
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
                this.sheetModel, "upload_sheet",
                [this.state.sheetId, file.name, dataB64]);
            this.attachmentId = result.attachment_id;
            this.state.hasSheet = true;
            this.notification.add(_t("Sheet uploaded."), { type: "success" });
            await this.renderPdf({ fit: true });
        } catch (error) {
            this.notification.add(
                _t("Upload failed — is the file a valid PDF?"),
                { type: "danger" });
            console.error(error);
        } finally {
            this.state.uploading = false;
        }
    }

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
                    this.pinModel, "create_pin_with_target",
                    [this.state.sheetId, posX, posY, vals.pinType, vals.name,
                     vals.description, vals.photo || null]);
                this.state.pins = [...this.state.pins, pin];
                this.state.addMode = false;
                this.notification.add(_t("Pin created."), { type: "success" });
            },
        });
    }

    async onPinClick(pin, ev) {
        ev.stopPropagation();
        const action = await this.orm.call(
            this.pinModel, "action_open_target", [pin.id]);
        if (!action) {
            this.notification.add(pin.name, { type: "info" });
            return;
        }
        this.action.doAction(
            { ...action, target: "new", views: [[false, "form"]] });
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
