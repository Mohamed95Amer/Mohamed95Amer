/** @odoo-module **/

import { Component, onWillStart, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { loadJS } from "@web/core/assets";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const LIB = "/construction_bim/static/lib";

// Colours the model is drawn in. Deliberately few: a model shaded in twenty
// tones tells you nothing from across a site office.
const BUCKET_COLOURS = {
    blocked: 0xc0483c,   // an open RFI — the element is waiting on an answer
    open: 0xd8a13a,      // work outstanding
    done: 0x2f7d5c,      // closed out
    none: 0xb9c4c8,      // nothing attached
};

// What is under construction on the chosen day, in the 4D view. One colour,
// because the question the slider answers is "is this up yet", not "how far
// along is it".
const SCHEDULE_ACTIVE = 0x1f6f8b;

// Overlaid models are tinted by discipline so a duct is recognisable as the
// mechanical model's duct without reading a legend.
const OVERLAY_COLOURS = {
    architectural: 0x9a7bb0,
    structural: 0x6b7f9e,
    mechanical: 0x3f8f7a,
    electrical: 0xc9a227,
    plumbing: 0x4a90a4,
    civil: 0x8a7f6d,
    federated: 0x7d7d7d,
    other: 0x8b6f9c,
};

/**
 * The IFC model viewer.
 *
 * Both libraries are loaded on demand rather than through Odoo's asset
 * bundles. web-ifc's browser build is 6 MB; putting it in
 * `web.assets_backend` would make every user download it on every page load
 * whether or not they ever open a model.
 */
export class BimViewer extends Component {
    static template = "construction_bim.Viewer";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.canvasRef = useRef("canvas");
        this.sideRef = useRef("side");
        this.modelId =
            this.props.action?.params?.model_id ||
            this.props.action?.context?.active_id;
        this.clashTestId = this.props.action?.params?.clash_test_id || null;

        this.state = useState({
            loading: true,
            librariesMissing: false,
            error: false,
            progress: _t("Reading the model…"),
            info: {},
            selected: null,
            elements: [],
            filter: "all",
            tab: "elements",
            // Interrogation tools
            storey: "all",
            isolated: false,
            hidden: 0,
            sectionOn: false,
            sectionHeight: 100,
            search: "",
            // Pins
            pins: [],
            placing: false,
            draft: null,
            showPsets: false,
            busy: false,
            // Federation and clash
            overlays: [],
            clashTest: null,
            clashSummary: null,
            // 4D
            hasSchedule: false,
            fourD: false,
            playDate: "",
            scheduleFrom: "",
            scheduleTo: "",
        });

        this.linkedByGlobalId = new Map();
        this.meshesByExpressId = new Map();
        this.storeyByExpressId = new Map();
        this.globalIdByExpressId = new Map();
        this.expressIdByGlobalId = new Map();
        this.scheduleByExpressId = new Map();
        this.overlays = new Map();
        this.hiddenExpressIds = new Set();
        this.pinMarkers = [];

        onWillStart(async () => {
            this.state.info = await this.orm.call(
                "construction.bim.model", "viewer_payload", [this.modelId]);
            for (const element of this.state.info.linked || []) {
                this.linkedByGlobalId.set(element.global_id, element);
            }
            this.state.elements = this.state.info.linked || [];
            this.state.pins = this.state.info.pins || [];
            this.pinTypes = this.state.info.pin_types || [];
            this.storeys = this.state.info.storeys || [];
            if (this.clashTestId) {
                this.state.clashTest = await this.orm.call(
                    "construction.bim.clash.test", "test_payload",
                    [this.clashTestId]);
            }
        });

        onMounted(() => this.start());
        onWillUnmount(() => this.dispose());
    }

    async start() {
        try {
            await this.loadLibraries();
        } catch {
            // The libraries are fetched by a setup script rather than
            // committed, so "not installed yet" is an ordinary state and gets
            // an instruction, not a stack trace.
            this.state.librariesMissing = true;
            this.state.loading = false;
            return;
        }
        try {
            await this.buildScene();
        } catch (error) {
            this.state.error = error.message || String(error);
        } finally {
            this.state.loading = false;
        }
    }

    async loadLibraries() {
        await loadJS(`${LIB}/web-ifc/web-ifc-api-iife.js`);
        if (!window.WebIFC) {
            throw new Error("web-ifc did not load");
        }
        this.THREE = await import(`${LIB}/three/three.module.min.js`);
    }

    reloadViewer() {
        window.location.reload();
    }

    async buildScene() {
        const THREE = this.THREE;
        const canvas = this.canvasRef.el;

        this.state.progress = _t("Downloading the IFC file…");
        const response = await fetch(this.state.info.file_url);
        if (!response.ok) {
            throw new Error(_t("The IFC file could not be downloaded."));
        }
        const buffer = new Uint8Array(await response.arrayBuffer());

        this.state.progress = _t("Parsing geometry…");
        this.api = new window.WebIFC.IfcAPI();
        this.api.SetWasmPath(`${LIB}/web-ifc/`, true);
        await this.api.Init();
        this.ifcModelId = this.api.OpenModel(buffer);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xeef1ef);
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(1, 2, 1);
        this.scene.add(key);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.state.progress = _t("Building the model…");
        const bounds = this.loadGeometry();
        this.frame(bounds);
        this.attachControls();
        this.resize();
        this.onWindowResize = this.resize.bind(this);
        window.addEventListener("resize", this.onWindowResize);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas.parentElement);
        canvas.addEventListener("click", this.onPick.bind(this));
        this.drawPins();
        this.render();
    }

    // ------------------------------------------------------------------
    // Clash detection
    // ------------------------------------------------------------------
    /**
     * World-space bounding box per element of a mesh set.
     *
     * One box per element rather than per mesh: an element built from four
     * meshes is one thing that either clashes or does not, and reporting it
     * four times is how a clash report becomes unreadable.
     */
    elementBoxes(meshesByExpressId, globalIdByExpressId) {
        const THREE = this.THREE;
        const boxes = [];
        for (const [expressID, meshes] of meshesByExpressId) {
            const globalId = globalIdByExpressId.get(expressID);
            if (!globalId) {
                continue;
            }
            const box = new THREE.Box3();
            for (const mesh of meshes) {
                box.expandByObject(mesh);
            }
            if (box.isEmpty()) {
                continue;
            }
            boxes.push({ globalId, box });
        }
        return boxes;
    }

    /**
     * Run the test between the host model and one overlay.
     *
     * Boxes are bucketed into a uniform grid before testing: every element
     * against every element is a hundred million comparisons on two models of
     * ten thousand elements, and the browser would simply stop. The grid makes
     * it proportional to how much the models actually overlap.
     *
     * What this finds is axis-aligned box overlap beyond the tolerance. It is
     * a broad phase, not a triangle-precise test — a duct through a door
     * opening will be reported — which is why the results have a status and
     * somebody can approve one as "seen, not a problem".
     */
    runClash(overlay, tolerance) {
        const hostBoxes = this.elementBoxes(
            this.meshesByExpressId, this.globalIdByExpressId);
        const otherBoxes = this.elementBoxes(
            overlay.meshesByExpressId, overlay.globalIdByExpressId);
        if (!hostBoxes.length || !otherBoxes.length) {
            return { results: [], skipped: 0 };
        }

        // Cell size from the median box, so the grid suits the model rather
        // than a number somebody guessed.
        const spans = hostBoxes.map((entry) => {
            const size = entry.box.getSize(new this.THREE.Vector3());
            return Math.max(size.x, size.y, size.z);
        }).sort((a, b) => a - b);
        const cell = Math.max(spans[Math.floor(spans.length / 2)] || 1, 0.5);

        const grid = new Map();
        const keyOf = (x, y, z) => `${x}|${y}|${z}`;
        const cellsOf = (box) => {
            const min = box.min, max = box.max;
            const cells = [];
            for (let x = Math.floor(min.x / cell); x <= Math.floor(max.x / cell); x++) {
                for (let y = Math.floor(min.y / cell); y <= Math.floor(max.y / cell); y++) {
                    for (let z = Math.floor(min.z / cell); z <= Math.floor(max.z / cell); z++) {
                        cells.push(keyOf(x, y, z));
                    }
                }
            }
            return cells;
        };

        for (const entry of hostBoxes) {
            for (const key of cellsOf(entry.box)) {
                const bucket = grid.get(key);
                if (bucket) {
                    bucket.push(entry);
                } else {
                    grid.set(key, [entry]);
                }
            }
        }

        const results = [];
        const seen = new Set();
        for (const other of otherBoxes) {
            for (const key of cellsOf(other.box)) {
                for (const host of grid.get(key) || []) {
                    const pair = `${host.globalId}|${other.globalId}`;
                    if (seen.has(pair)) {
                        continue;
                    }
                    seen.add(pair);
                    const hit = this.overlapOf(host.box, other.box, tolerance);
                    if (hit) {
                        results.push({
                            global_id_a: host.globalId,
                            global_id_b: other.globalId,
                            overlap: hit.overlap,
                            x: hit.centre.x, y: hit.centre.y, z: hit.centre.z,
                        });
                    }
                }
            }
        }
        results.sort((a, b) => b.overlap - a.overlap);
        return { results, skipped: 0 };
    }

    /** The depth of an intersection, or nothing if it is within tolerance. */
    overlapOf(a, b, tolerance) {
        const THREE = this.THREE;
        const min = new THREE.Vector3(
            Math.max(a.min.x, b.min.x),
            Math.max(a.min.y, b.min.y),
            Math.max(a.min.z, b.min.z));
        const max = new THREE.Vector3(
            Math.min(a.max.x, b.max.x),
            Math.min(a.max.y, b.max.y),
            Math.min(a.max.z, b.max.z));
        const depth = Math.min(max.x - min.x, max.y - min.y, max.z - min.z);
        if (!(depth > tolerance)) {
            return null;
        }
        return {
            overlap: depth,
            centre: min.clone().add(max).multiplyScalar(0.5),
        };
    }

    async startClashRun() {
        const test = this.state.clashTest;
        if (!test) {
            return;
        }
        this.state.busy = true;
        this.state.progress = _t("Loading the model to test against…");
        try {
            const overlay = await this.loadOverlay({
                id: test.model_b.id,
                name: test.model_b.name,
                discipline: "other",
                file_url: test.model_b.file_url,
            });
            this.state.progress = _t("Testing…");
            // Yield once so the message paints before the loop blocks.
            await new Promise((resolve) => setTimeout(resolve, 50));
            const { results, skipped } = this.runClash(overlay, test.tolerance);
            const summary = await this.orm.call(
                "construction.bim.clash.test", "record_results",
                [test.id, results, skipped],
            );
            this.state.clashSummary = summary;
            this.notification.add(
                _t("%(found)s clash(es) found, %(created)s new.", summary),
                { type: summary.found ? "warning" : "success" },
            );
        } catch (error) {
            this.notification.add(error.message || String(error),
                                  { type: "danger" });
        } finally {
            this.state.busy = false;
        }
    }

    async openClashList() {
        await this.action.doAction({
            type: "ir.actions.act_window",
            name: _t("Clashes"),
            res_model: "construction.bim.clash",
            views: [[false, "list"], [false, "form"]],
            domain: [["test_id", "=", this.state.clashTest.id]],
        });
    }

    // ------------------------------------------------------------------
    // Federation — several disciplines in one scene
    // ------------------------------------------------------------------
    /**
     * Load another model on top of this one.
     *
     * Overlays are for coordination, not for record-keeping: pins and links
     * stay with the host model, because "which model is this pin on" has to
     * have one answer. What an overlay is for is seeing the duct and the beam
     * in the same space, and testing whether they occupy it at once.
     */
    async loadOverlay(entry) {
        const THREE = this.THREE;
        if (this.overlays.has(entry.id)) {
            return this.overlays.get(entry.id);
        }
        this.state.progress = _t("Loading %s…", entry.name);
        this.state.busy = true;
        try {
            const response = await fetch(entry.file_url);
            if (!response.ok) {
                throw new Error(_t("%s could not be downloaded.", entry.name));
            }
            const buffer = new Uint8Array(await response.arrayBuffer());
            const ifcModelId = this.api.OpenModel(buffer);
            const colour = new THREE.Color(
                OVERLAY_COLOURS[entry.discipline] || OVERLAY_COLOURS.other);
            const built = this.buildMeshes(ifcModelId, { tint: colour });
            built.group.name = `overlay-${entry.id}`;
            this.scene.add(built.group);
            const overlay = {
                ...entry,
                ifcModelId,
                group: built.group,
                meshesByExpressId: built.meshesByExpressId,
                globalIdByExpressId: built.globalIdByExpressId,
                visible: true,
            };
            this.overlays.set(entry.id, overlay);
            this.state.overlays = [...this.state.overlays, {
                id: entry.id, name: entry.name,
                discipline: entry.discipline, visible: true,
            }];
            this.render();
            return overlay;
        } finally {
            this.state.busy = false;
        }
    }

    toggleOverlay(id) {
        const overlay = this.overlays.get(id);
        if (!overlay) {
            return;
        }
        overlay.visible = !overlay.visible;
        overlay.group.visible = overlay.visible;
        this.state.overlays = this.state.overlays.map(
            (row) => (row.id === id ? { ...row, visible: overlay.visible } : row));
        this.render();
    }

    async onOverlayPicked(value) {
        const id = Number(value);
        if (!id) {
            return;
        }
        if (this.overlays.has(id)) {
            this.toggleOverlay(id);
            return;
        }
        const entry = (this.state.info.federation || []).find((f) => f.id === id);
        if (entry) {
            try {
                await this.loadOverlay(entry);
            } catch (error) {
                this.notification.add(error.message || String(error),
                                      { type: "danger" });
            }
        }
    }

    /** Turn web-ifc's flat vertex arrays into meshes the scene can draw. */
    loadGeometry() {
        const built = this.buildMeshes(this.ifcModelId);
        this.meshesByExpressId = built.meshesByExpressId;
        this.scene.add(built.group);
        this.modelGroup = built.group;
        const bounds = new this.THREE.Box3().setFromObject(built.group);
        this.indexGlobalIds();
        this.indexStoreys();
        this.paintLinkedElements();
        this.indexSchedule();
        this.modelBounds = bounds;
        return bounds;
    }

    /**
     * Build the meshes of one opened IFC model.
     *
     * Shared by the host model and by every overlay, because a federated model
     * is drawn exactly the same way — the only difference is that an overlay is
     * tinted so you can tell whose duct it is.
     */
    buildMeshes(ifcModelId, { tint = null } = {}) {
        const THREE = this.THREE;
        const group = new THREE.Group();
        const meshesByExpressId = new Map();
        const globalIdByExpressId = new Map();

        this.api.StreamAllMeshes(ifcModelId, (mesh) => {
            const placed = mesh.geometries;
            for (let index = 0; index < placed.size(); index++) {
                const item = placed.get(index);
                const raw = this.api.GetGeometry(
                    ifcModelId, item.geometryExpressID);
                const vertices = this.api.GetVertexArray(
                    raw.GetVertexData(), raw.GetVertexDataSize());
                const indices = this.api.GetIndexArray(
                    raw.GetIndexData(), raw.GetIndexDataSize());

                // web-ifc interleaves position and normal, six floats a vertex.
                const positions = new Float32Array(vertices.length / 2);
                const normals = new Float32Array(vertices.length / 2);
                for (let v = 0; v < vertices.length; v += 6) {
                    const target = v / 2;
                    positions[target] = vertices[v];
                    positions[target + 1] = vertices[v + 1];
                    positions[target + 2] = vertices[v + 2];
                    normals[target] = vertices[v + 3];
                    normals[target + 1] = vertices[v + 4];
                    normals[target + 2] = vertices[v + 5];
                }

                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                    "position", new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute(
                    "normal", new THREE.BufferAttribute(normals, 3));
                geometry.setIndex(new THREE.BufferAttribute(indices, 1));

                const colour = item.color;
                const material = new THREE.MeshLambertMaterial({
                    color: tint || new THREE.Color(colour.x, colour.y, colour.z),
                    // An overlay is drawn see-through: coordination means
                    // looking at the duct and the beam at once, and an opaque
                    // second model just hides the first.
                    transparent: Boolean(tint) || colour.w !== 1,
                    opacity: tint ? 0.55 : colour.w,
                    side: THREE.DoubleSide,
                });
                const object = new THREE.Mesh(geometry, material);
                object.matrix.fromArray(item.flatTransformation);
                object.matrixAutoUpdate = false;
                object.userData.expressID = mesh.expressID;
                object.userData.baseColour = material.color.clone();
                group.add(object);

                const existing = meshesByExpressId.get(mesh.expressID) || [];
                existing.push(object);
                meshesByExpressId.set(mesh.expressID, existing);
                raw.delete();
            }
        });

        for (const [expressID] of meshesByExpressId) {
            const globalId = this.globalIdOfModel(ifcModelId, expressID);
            if (globalId) {
                globalIdByExpressId.set(expressID, globalId);
            }
        }
        return { group, meshesByExpressId, globalIdByExpressId };
    }

    globalIdOfModel(ifcModelId, expressID) {
        try {
            return this.api.GetLine(ifcModelId, expressID)?.GlobalId?.value || null;
        } catch {
            return null;
        }
    }

    /**
     * Recolour elements that carry records.
     *
     * This is the reason the module exists. A model everyone can spin around
     * is a picture; a model where the wall with the open RFI is red is a
     * question somebody can answer.
     */
    paintLinkedElements() {
        const THREE = this.THREE;
        if (!this.linkedByGlobalId.size) {
            return;
        }
        for (const [expressID, meshes] of this.meshesByExpressId) {
            const globalId = this.globalIdOf(expressID);
            const element = globalId && this.linkedByGlobalId.get(globalId);
            if (!element) {
                continue;
            }
            const colour = BUCKET_COLOURS[element.link_bucket] || BUCKET_COLOURS.open;
            for (const mesh of meshes) {
                mesh.material = new THREE.MeshLambertMaterial({
                    color: new THREE.Color(colour),
                    side: THREE.DoubleSide,
                });
                mesh.userData.globalId = globalId;
                // The link colour is this mesh's colour from now on. Without
                // this, anything that restores the base colour — the 4D
                // slider — would quietly repaint every RFI grey.
                mesh.userData.baseColour = mesh.material.color.clone();
            }
        }
    }

    /**
     * Resolve every drawn element's GlobalId once.
     *
     * Each lookup crosses into the WASM parser, and three separate passes were
     * each paying that cost per element. One pass, cached both ways, because
     * everything after this — storeys, links, the programme, pins — is keyed
     * on GlobalId.
     */
    indexGlobalIds() {
        for (const [expressID] of this.meshesByExpressId) {
            const globalId = this.globalIdOf(expressID);
            if (!globalId) {
                continue;
            }
            this.globalIdByExpressId.set(expressID, globalId);
            this.expressIdByGlobalId.set(globalId, expressID);
        }
    }

    /** Map each drawn element to the storey the index says it is on. */
    indexStoreys() {
        const byGlobalId = new Map();
        for (const element of this.state.elements) {
            byGlobalId.set(element.global_id, element.storey || "");
        }
        for (const [expressID] of this.meshesByExpressId) {
            const globalId = this.globalIdOf(expressID);
            if (globalId && byGlobalId.has(globalId)) {
                this.storeyByExpressId.set(expressID, byGlobalId.get(globalId));
            }
        }
    }

    // ------------------------------------------------------------------
    // Interrogating the model
    // ------------------------------------------------------------------

    /**
     * Show one storey at a time.
     *
     * A federated model is unreadable from outside — every question about
     * level three is asked by first getting rid of levels one, two and four.
     * Only elements the index placed on a storey can be filtered, so anything
     * unplaced stays visible rather than silently disappearing.
     */
    setStorey(storey) {
        this.state.storey = storey;
        for (const [expressID, meshes] of this.meshesByExpressId) {
            const on = this.storeyByExpressId.get(expressID);
            const visible = storey === "all" || !on || on === storey;
            for (const mesh of meshes) {
                mesh.userData.storeyHidden = !visible;
            }
        }
        this.applyVisibility();
        // Pins belong to a storey too — leaving them all on screen while the
        // model shows one level puts markers in mid-air.
        this.drawPins();
    }

    /** Hide everything except the current selection. */
    isolateSelection() {
        const selected = this.state.selected?.expressID;
        if (!selected) {
            return;
        }
        this.state.isolated = true;
        for (const [expressID, meshes] of this.meshesByExpressId) {
            for (const mesh of meshes) {
                mesh.userData.isolatedOut = expressID !== selected;
            }
        }
        this.applyVisibility();
    }

    /** Hide the current selection and keep going. */
    hideSelection() {
        const selected = this.state.selected?.expressID;
        if (!selected) {
            return;
        }
        this.hiddenExpressIds.add(selected);
        this.state.hidden = this.hiddenExpressIds.size;
        this.state.selected = null;
        this.applyVisibility();
    }

    showEverything() {
        this.hiddenExpressIds.clear();
        this.state.hidden = 0;
        this.state.isolated = false;
        this.state.storey = "all";
        for (const meshes of this.meshesByExpressId.values()) {
            for (const mesh of meshes) {
                mesh.userData.isolatedOut = false;
                mesh.userData.storeyHidden = false;
            }
        }
        this.applyVisibility();
    }

    applyVisibility() {
        for (const [expressID, meshes] of this.meshesByExpressId) {
            const hidden =
                this.hiddenExpressIds.has(expressID) ||
                meshes.some((m) => m.userData.isolatedOut || m.userData.storeyHidden
                    || m.userData.notBuiltYet);
            for (const mesh of meshes) {
                mesh.visible = !hidden;
            }
        }
        this.render();
    }

    // ------------------------------------------------------------------
    // 4D — the model as it should stand on a given day
    // ------------------------------------------------------------------
    /**
     * Index the programme by element.
     *
     * Dates come from the tasks elements are linked to, so this is the real
     * programme rather than a second one kept inside the model. An element
     * with no task is treated as existing throughout: a model is not a
     * complete programme, and hiding everything nobody has scheduled yet would
     * leave an empty screen on day one.
     */
    indexSchedule() {
        this.scheduleByExpressId = new Map();
        const dates = [];
        for (const row of this.state.info.schedule || []) {
            const expressID = this.expressIdByGlobalId.get(row.global_id);
            const start = row.start ? new Date(row.start) : null;
            const finish = row.finish ? new Date(row.finish) : start;
            if (start) {
                dates.push(start.getTime());
            }
            if (finish) {
                dates.push(finish.getTime());
            }
            if (expressID !== undefined) {
                this.scheduleByExpressId.set(expressID, { start, finish, task: row.task });
            }
        }
        if (!dates.length) {
            return;
        }
        this.state.scheduleFrom = new Date(Math.min(...dates))
            .toISOString().slice(0, 10);
        this.state.scheduleTo = new Date(Math.max(...dates))
            .toISOString().slice(0, 10);
        this.state.hasSchedule = true;
        this.state.playDate = this.state.scheduleTo;
    }

    toggleFourD() {
        this.state.fourD = !this.state.fourD;
        if (this.state.fourD) {
            this.state.playDate = this.state.scheduleFrom;
        }
        this.applySchedule();
    }

    setPlayDate(value) {
        this.state.playDate = value;
        this.applySchedule();
    }

    /** The slider and the date box drive the same thing from both ends. */
    get playPercent() {
        const from = new Date(this.state.scheduleFrom).getTime();
        const to = new Date(this.state.scheduleTo).getTime();
        const at = new Date(this.state.playDate).getTime();
        if (!(to > from) || Number.isNaN(at)) {
            return 0;
        }
        return Math.round(((at - from) / (to - from)) * 100);
    }

    setPlayPercent(value) {
        const from = new Date(this.state.scheduleFrom).getTime();
        const to = new Date(this.state.scheduleTo).getTime();
        if (!(to > from)) {
            return;
        }
        const at = new Date(from + ((to - from) * Number(value)) / 100);
        this.setPlayDate(at.toISOString().slice(0, 10));
    }

    /** Hide what has not started, and colour what is in progress. */
    applySchedule() {
        const on = this.state.fourD;
        const day = on ? new Date(this.state.playDate).getTime() : 0;
        for (const [expressID, meshes] of this.meshesByExpressId) {
            const row = this.scheduleByExpressId.get(expressID);
            const notStarted = Boolean(
                on && row && row.start && row.start.getTime() > day);
            // In progress on the chosen day: started, not finished. Drawn in
            // the site's colour rather than hidden, so a screenshot of the
            // model reads as a programme rather than as a half-built shell.
            const active = Boolean(
                on && row && !notStarted && row.finish
                && row.finish.getTime() >= day);
            for (const mesh of meshes) {
                mesh.userData.notBuiltYet = notStarted;
                this.tintMesh(mesh, active ? SCHEDULE_ACTIVE : null);
            }
        }
        this.applyVisibility();
    }

    tintMesh(mesh, colour) {
        if (!mesh.userData.baseColour) {
            return;
        }
        mesh.material.color.set(colour || mesh.userData.baseColour);
    }

    /**
     * A horizontal cut through the model.
     *
     * Clipping is done by the renderer rather than by rebuilding geometry, so
     * the slider is smooth on a model too big to re-mesh per frame.
     */
    toggleSection() {
        this.state.sectionOn = !this.state.sectionOn;
        this.updateSection();
    }

    setSectionHeight(value) {
        this.state.sectionHeight = Number(value);
        this.updateSection();
    }

    updateSection() {
        const THREE = this.THREE;
        if (!this.renderer || !this.modelBounds) {
            return;
        }
        if (!this.state.sectionOn) {
            this.renderer.clippingPlanes = [];
            this.render();
            return;
        }
        const min = this.modelBounds.min.y;
        const max = this.modelBounds.max.y;
        const at = min + ((max - min) * this.state.sectionHeight) / 100;
        this.renderer.localClippingEnabled = true;
        this.renderer.clippingPlanes = [
            new THREE.Plane(new THREE.Vector3(0, -1, 0), at),
        ];
        this.render();
    }

    /** Frame the selection, or the whole model when nothing is selected. */
    fitView() {
        const selected = this.state.selected?.expressID;
        const meshes = selected ? this.meshesByExpressId.get(selected) : null;
        if (meshes && meshes.length) {
            const THREE = this.THREE;
            const box = new THREE.Box3();
            for (const mesh of meshes) {
                box.expandByObject(mesh);
            }
            this.frame(box);
        } else if (this.modelBounds) {
            this.frame(this.modelBounds);
        }
        this.render();
    }

    globalIdOf(expressID) {
        if (this.globalIdByExpressId.has(expressID)) {
            return this.globalIdByExpressId.get(expressID);
        }
        try {
            const line = this.api.GetLine(this.ifcModelId, expressID);
            return line?.GlobalId?.value || null;
        } catch {
            return null;
        }
    }

    frame(box) {
        const THREE = this.THREE;
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) || 10;
        this.target = centre;
        this.spherical = { radius: radius * 2, theta: Math.PI / 4, phi: Math.PI / 3.2 };
        this.updateCamera();
    }

    updateCamera() {
        const { radius, theta, phi } = this.spherical;
        this.camera.position.set(
            this.target.x + radius * Math.sin(phi) * Math.cos(theta),
            this.target.y + radius * Math.cos(phi),
            this.target.z + radius * Math.sin(phi) * Math.sin(theta),
        );
        this.camera.lookAt(this.target);
    }

    /**
     * Orbit, zoom and pan, written by hand rather than pulling in a library.
     *
     * Two fingers matter as much as the mouse wheel here. A site engineer
     * opening a model on a phone could rotate it but not zoom, which makes the
     * viewer a demo rather than a tool: everything worth looking at on a model
     * is closer than the default camera.
     */
    attachControls() {
        const canvas = this.canvasRef.el;
        const active = new Map();
        let last = { x: 0, y: 0 };
        let pinchDistance = 0;

        const spread = () => {
            const [a, b] = [...active.values()];
            return Math.hypot(a.x - b.x, a.y - b.y);
        };
        const centre = () => {
            const points = [...active.values()];
            return {
                x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
                y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
            };
        };
        const zoomBy = (factor) => {
            this.spherical.radius = Math.max(
                0.5, Math.min(this.spherical.radius * factor, 100000));
            this.updateCamera();
            this.render();
        };

        canvas.addEventListener("pointerdown", (event) => {
            active.set(event.pointerId, { x: event.clientX, y: event.clientY });
            canvas.setPointerCapture(event.pointerId);
            if (active.size === 2) {
                pinchDistance = spread();
            }
            last = active.size === 2 ? centre()
                : { x: event.clientX, y: event.clientY };
        });

        const release = (event) => {
            active.delete(event.pointerId);
            if (canvas.hasPointerCapture?.(event.pointerId)) {
                canvas.releasePointerCapture(event.pointerId);
            }
            pinchDistance = 0;
            if (active.size === 1) {
                last = [...active.values()][0];
            }
        };
        canvas.addEventListener("pointerup", release);
        // Without this a finger leaving the glass edge-first leaves the view
        // stuck in a drag that never ends.
        canvas.addEventListener("pointercancel", release);
        canvas.addEventListener("pointerleave", release);

        canvas.addEventListener("pointermove", (event) => {
            if (!active.has(event.pointerId)) {
                return;
            }
            active.set(event.pointerId, { x: event.clientX, y: event.clientY });

            if (active.size >= 2) {
                // Pinch to zoom, drag with two fingers to pan the target.
                const distance = spread();
                if (pinchDistance) {
                    zoomBy(pinchDistance / (distance || pinchDistance));
                }
                pinchDistance = distance;
                const middle = centre();
                this.panBy(middle.x - last.x, middle.y - last.y);
                last = middle;
                return;
            }

            const dx = event.clientX - last.x;
            const dy = event.clientY - last.y;
            last = { x: event.clientX, y: event.clientY };
            this.spherical.theta -= dx * 0.006;
            // Stop just short of the poles: straight overhead flips the view.
            this.spherical.phi = Math.min(
                Math.PI - 0.05, Math.max(0.05, this.spherical.phi - dy * 0.006));
            this.updateCamera();
            this.render();
        });

        canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
            zoomBy(event.deltaY > 0 ? 1.12 : 0.89);
        }, { passive: false });

        // The browser's own pinch-zoom would scale the page rather than the
        // model, which on a canvas is never what anybody meant.
        canvas.style.touchAction = "none";
    }

    /** Slide the point the camera orbits, in the plane of the screen. */
    panBy(dx, dy) {
        const THREE = this.THREE;
        if (!dx && !dy) {
            return;
        }
        const scale = this.spherical.radius / 600;
        const forward = new THREE.Vector3()
            .subVectors(this.target, this.camera.position).normalize();
        const right = new THREE.Vector3()
            .crossVectors(forward, this.camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();
        this.target.addScaledVector(right, -dx * scale);
        this.target.addScaledVector(up, dy * scale);
        this.updateCamera();
        this.render();
    }

    onPick(event) {
        const canvas = this.canvasRef.el;
        const rect = canvas.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);

        // Pins first: a click on a marker opens what it stands for rather than
        // selecting the wall behind it.
        if (this.pinMarkers.length) {
            const onPin = this.raycaster.intersectObjects(this.pinMarkers, true);
            if (onPin.length) {
                this.openPin(onPin[0].object.userData.pin);
                return;
            }
        }

        const visible = this.modelGroup.children.filter((m) => m.visible);
        const hits = this.raycaster.intersectObjects(visible, false);
        if (!hits.length) {
            if (!this.state.placing) {
                this.state.selected = null;
            }
            return;
        }

        const hit = hits[0];
        const expressID = hit.object.userData.expressID;
        const globalId = hit.object.userData.globalId || this.globalIdOf(expressID);

        if (this.state.placing) {
            // The click point is where the pin goes — in model space, so it
            // stays on the crack rather than on a screen position.
            this.state.draft = {
                position: [hit.point.x, hit.point.y, hit.point.z],
                global_id: globalId || "",
                pin_type: "note",
                name: "",
                note: "",
            };
            this.state.placing = false;
            return;
        }

        this.state.selected = {
            expressID,
            globalId,
            element: globalId ? this.linkedByGlobalId.get(globalId) : null,
            properties: this.propertiesOf(expressID, globalId),
            psets: [],
        };
        this.loadProperties(globalId);
    }

    /** What the model itself knows about an element. */
    propertiesOf(expressID, globalId) {
        const rows = [];
        try {
            const line = this.api.GetLine(this.ifcModelId, expressID);
            const type = line?.constructor?.name || "";
            if (type) {
                rows.push({ label: _t("IFC type"), value: type });
            }
            if (line?.Name?.value) {
                rows.push({ label: _t("Name"), value: line.Name.value });
            }
            if (line?.ObjectType?.value) {
                rows.push({ label: _t("Object type"), value: line.ObjectType.value });
            }
            if (line?.Tag?.value) {
                rows.push({ label: _t("Tag"), value: line.Tag.value });
            }
        } catch {
            // A nested component may not resolve to a line; the GlobalId and
            // storey below are still worth showing.
        }
        const storey = this.storeyByExpressId.get(expressID);
        if (storey) {
            rows.push({ label: _t("Storey"), value: storey });
        }
        // The indexed quantities. Read from the server's index rather than
        // recomputed from the mesh: a volume measured off a triangulated
        // surface is not the volume the model was exported with, and it is the
        // exported one a bill is checked against.
        const indexed = globalId ? this.linkedByGlobalId.get(globalId) : null;
        for (const [key, label] of [
            ["quantity_count", _t("Count")],
            ["quantity_length", _t("Length")],
            ["quantity_area", _t("Area")],
            ["quantity_volume", _t("Volume")],
        ]) {
            if (indexed && indexed[key]) {
                rows.push({ label, value: indexed[key].toFixed(3) });
            }
        }
        if (globalId) {
            rows.push({ label: _t("GlobalId"), value: globalId });
        }
        return rows;
    }

    /**
     * Fetch an element's property sets on demand.
     *
     * Not sent with the payload: a model of any size carries tens of thousands
     * of properties, and the viewer needs the thirty belonging to whatever was
     * just clicked.
     */
    async loadProperties(globalId) {
        if (!globalId) {
            return;
        }
        const rows = await this.orm.searchRead(
            "construction.bim.property",
            [["model_id", "=", this.modelId], ["element_id.global_id", "=", globalId]],
            ["pset", "name", "value"],
            { limit: 200 },
        );
        if (this.state.selected && this.state.selected.globalId === globalId) {
            this.state.selected.psets = rows;
        }
    }

    // ------------------------------------------------------------------
    // Pins
    // ------------------------------------------------------------------
    startPlacing() {
        this.state.placing = true;
        this.state.selected = null;
        this.state.draft = null;
    }

    cancelDraft() {
        this.state.placing = false;
        this.state.draft = null;
    }

    async saveDraft() {
        const draft = this.state.draft;
        if (!draft || !draft.name.trim()) {
            this.notification.add(_t("Give the pin a name."), { type: "warning" });
            return;
        }
        const pin = await this.orm.call(
            "construction.bim.pin", "drop_pin",
            [this.modelId, {
                name: draft.name,
                note: draft.note,
                pin_type: draft.pin_type,
                global_id: draft.global_id,
                pos_x: draft.position[0],
                pos_y: draft.position[1],
                pos_z: draft.position[2],
                // The view it was seen from, not only the point. This is what
                // BCF carries to Solibri and back, and what lets somebody
                // else stand where the person raising it stood.
                ...this.cameraState(),
            }],
        );
        if (pin && pin.id) {
            this.state.pins = [...this.state.pins, pin];
            this.drawPins();
            // Show the pin in the list as well as on the model, so it is clear
            // the click produced a record and not just a marker.
            this.state.tab = "pins";
            this.notification.add(
                _t("%s created and pinned.", this.pinTypeLabel(pin.pin_type)),
                { type: "success" },
            );
        }
        this.state.draft = null;
    }

    /**
     * Draw the pins as markers anchored in model space.
     *
     * Solid geometry rather than sprites: a sprite always faces the camera and
     * so gives no sense of which side of a wall the pin is on, which is exactly
     * what somebody looking for it on site needs to know.
     */
    drawPins() {
        const THREE = this.THREE;
        if (!this.scene) {
            return;
        }
        for (const marker of this.pinMarkers) {
            this.scene.remove(marker);
            marker.traverse((part) => {
                if (part.isMesh) {
                    part.geometry.dispose();
                    part.material.dispose();
                }
            });
        }
        this.pinMarkers = [];

        // Sized off the model, not off a fixed number of metres: the same
        // viewer has to show a villa and a tower, and a marker that reads well
        // on one is invisible or absurd on the other.
        const radius = this.modelBounds
            ? Math.max(this.modelBounds.getSize(new THREE.Vector3()).length() / 45, 0.2)
            : 0.5;
        for (const pin of this.visiblePins) {
            const colour = BUCKET_COLOURS[pin.bucket] || BUCKET_COLOURS.open;
            const material = new THREE.MeshBasicMaterial({
                color: colour, depthTest: false });
            const marker = new THREE.Group();

            // Head above, tapered stem below, tip on the point that was
            // clicked — so the marker says where the defect is without hiding
            // it behind a ball sitting on top of it.
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 20, 14), material);
            head.position.y = radius * 3.2;
            const stem = new THREE.Mesh(
                new THREE.ConeGeometry(radius * 0.62, radius * 2.6, 20),
                material.clone(),
            );
            // Cone points up by default; flip it so the apex is at the hit.
            stem.rotation.x = Math.PI;
            stem.position.y = radius * 1.3;

            for (const part of [head, stem]) {
                part.renderOrder = 999;
                part.userData.pin = pin;
                marker.add(part);
                // An amber pin on an amber slab is no pin at all. A slightly
                // larger back-faced copy draws a dark outline around the
                // marker, so it separates from whatever it was dropped on.
                const outline = new THREE.Mesh(
                    part.geometry,
                    new THREE.MeshBasicMaterial({
                        color: 0x14261f,
                        side: THREE.BackSide,
                        depthTest: false,
                    }),
                );
                outline.position.copy(part.position);
                outline.rotation.copy(part.rotation);
                outline.scale.setScalar(1.22);
                outline.renderOrder = 998;
                // Decoration only: a click that lands on the outline must open
                // the pin, and it does, because only the coloured part is hit.
                outline.raycast = () => {};
                marker.add(outline);
            }
            // A white centre inside the coloured head. Without it the pin is
            // legible only by its outline whenever the bucket colour happens
            // to match what it was dropped on — amber pin, amber slab.
            const core = new THREE.Mesh(
                new THREE.SphereGeometry(radius * 0.42, 14, 10),
                new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
            );
            core.position.copy(head.position);
            core.renderOrder = 1000;
            core.userData.pin = pin;
            marker.add(core);

            marker.position.set(...pin.position);
            marker.userData.pin = pin;
            this.scene.add(marker);
            this.pinMarkers.push(marker);
        }
        this.render();
    }

    setTab(tab) {
        this.state.tab = tab;
    }

    /** Where the camera is, in the shape the pin stores. */
    cameraState() {
        if (!this.camera) {
            return {};
        }
        return {
            cam_x: this.camera.position.x,
            cam_y: this.camera.position.y,
            cam_z: this.camera.position.z,
            cam_target_x: this.target.x,
            cam_target_y: this.target.y,
            cam_target_z: this.target.z,
        };
    }

    /**
     * Put the camera back where the pin was dropped from.
     *
     * Restoring the saved view rather than framing the point is the difference
     * between "here is the wall" and "here is what I was looking at" — the
     * second is the one that explains an issue without a paragraph of text.
     */
    restoreViewpoint(pin) {
        const THREE = this.THREE;
        const [cx, cy, cz] = pin.camera;
        const [tx, ty, tz] = pin.camera_target;
        this.target = new THREE.Vector3(tx, ty, tz);
        const offset = new THREE.Vector3(cx - tx, cy - ty, cz - tz);
        const radius = offset.length() || 10;
        // The hand-rolled controls orbit in spherical coordinates, so the
        // stored Cartesian camera has to be expressed in them or the next drag
        // would snap the view somewhere else.
        this.spherical = {
            radius,
            theta: Math.atan2(offset.z, offset.x),
            phi: Math.acos(Math.min(1, Math.max(-1, offset.y / radius))),
        };
        this.updateCamera();
    }

    /**
     * Fly the camera to a pin and select it.
     *
     * A pin nobody can find is a pin nobody acts on: on a tower model the
     * marker for a defect on level nine is a few pixels from anywhere useful.
     * The list is how you get there — clicking a row puts the camera in front
     * of the thing the pin is about, close enough to see it in context.
     */
    focusPin(pin) {
        const THREE = this.THREE;
        if (!this.camera || !pin.position) {
            return;
        }
        if (pin.has_viewpoint && pin.camera && pin.camera_target) {
            this.restoreViewpoint(pin);
        } else {
            // No saved view: frame a room-sized box around the pin rather than
            // the pin itself, because standing on top of a marker tells you
            // nothing about where it is.
            const span = this.modelBounds
                ? this.modelBounds.getSize(new THREE.Vector3()).length() / 8
                : 4;
            const centre = new THREE.Vector3(...pin.position);
            this.frame(new THREE.Box3().setFromCenterAndSize(
                centre, new THREE.Vector3(span, span, span).addScalar(2)));
        }
        // Show the storey the pin is on, otherwise a filter left on another
        // level flies the camera to an empty space.
        if (pin.storey && this.state.storey !== "all"
                && this.state.storey !== pin.storey) {
            this.setStorey(pin.storey);
        }
        this.state.selected = {
            expressID: null,
            globalId: pin.global_id,
            element: null,
            pin,
            title: pin.name,
            eyebrow: this.pinTypeLabel(pin.pin_type).toUpperCase(),
            properties: [
                { label: _t("Status"), value: pin.status || _t("—") },
                { label: _t("Note"), value: pin.note || _t("—") },
                { label: _t("Storey"), value: pin.storey || _t("—") },
            ],
        };
        this.render();
    }

    pinTypeLabel(id) {
        return this.pinTypes.find((type) => type.id === id)?.label || id;
    }

    pinIcon(id) {
        return this.pinTypes.find((type) => type.id === id)?.icon || "fa-map-marker";
    }

    async openPin(pin) {
        const action = await this.orm.call(
            "construction.bim.pin", "action_open_record", [[pin.id]]);
        if (action) {
            await this.action.doAction(action);
        } else {
            this.state.selected = {
                expressID: null,
                globalId: pin.global_id,
                element: null,
                properties: [
                    { label: _t("Pin"), value: pin.name },
                    { label: _t("Note"), value: pin.note || "—" },
                ],
            };
        }
    }

    /** Pins on the current storey. What the model draws. */
    get visiblePins() {
        if (this.state.storey === "all") {
            return this.state.pins;
        }
        return this.state.pins.filter(
            (pin) => !pin.storey || pin.storey === this.state.storey);
    }

    /**
     * Pins in the list, which is the storey filter plus the search box and the
     * status filter — the same three controls that narrow the element list, so
     * the two tabs behave the same way rather than each having its own rules.
     */
    get listedPins() {
        const term = (this.state.search || "").trim().toLowerCase();
        return this.visiblePins.filter((pin) => {
            if (this.state.filter !== "all" && pin.bucket !== this.state.filter) {
                return false;
            }
            if (!term) {
                return true;
            }
            return [pin.name, pin.note, pin.status, pin.storey]
                .some((value) => (value || "").toLowerCase().includes(term));
        });
    }

    async openElement(element) {
        const [id] = await this.orm.search(
            "construction.bim.element",
            [["model_id", "=", this.modelId], ["global_id", "=", element.global_id]],
            { limit: 1 },
        );
        if (!id) {
            return;
        }
        await this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "construction.bim.element",
            res_id: id,
            views: [[false, "form"]],
            target: "new",
        });
    }

    get visibleElements() {
        const term = (this.state.search || "").trim().toLowerCase();
        return this.state.elements.filter((element) => {
            if (this.state.filter !== "all" && element.link_bucket !== this.state.filter) {
                return false;
            }
            if (this.state.storey !== "all" && element.storey
                    && element.storey !== this.state.storey) {
                return false;
            }
            if (!term) {
                return true;
            }
            return `${element.name} ${element.ifc_type} ${element.link_summary}`
                .toLowerCase().includes(term);
        });
    }

    setFilter(value) {
        this.state.filter = value;
    }

    showDetails() {
        this.sideRef.el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    showModel() {
        this.canvasRef.el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    resize() {
        const canvas = this.canvasRef.el;
        if (!canvas || !this.renderer) {
            return;
        }
        const { clientWidth, clientHeight } = canvas.parentElement;
        this.renderer.setSize(clientWidth, clientHeight, false);
        this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
        this.camera.updateProjectionMatrix();
        this.render();
    }

    render() {
        if (this.renderer) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    dispose() {
        if (this.onWindowResize) {
            window.removeEventListener("resize", this.onWindowResize);
        }
        this.resizeObserver?.disconnect();
        if (this.api && this.ifcModelId !== undefined) {
            try {
                this.api.CloseModel(this.ifcModelId);
            } catch {
                // Nothing useful to do if the WASM side has already gone.
            }
        }
        this.renderer?.dispose();
    }
}

registry.category("actions").add("construction_bim.viewer", BimViewer);
