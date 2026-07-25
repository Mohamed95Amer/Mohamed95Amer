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
        this.modelId =
            this.props.action?.params?.model_id ||
            this.props.action?.context?.active_id;

        this.state = useState({
            loading: true,
            librariesMissing: false,
            error: false,
            progress: _t("Reading the model…"),
            info: {},
            selected: null,
            elements: [],
            filter: "all",
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
        });

        this.linkedByGlobalId = new Map();
        this.meshesByExpressId = new Map();
        this.storeyByExpressId = new Map();
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
        window.addEventListener("resize", this.resize.bind(this));
        canvas.addEventListener("click", this.onPick.bind(this));
        this.drawPins();
        this.render();
    }

    /** Turn web-ifc's flat vertex arrays into meshes the scene can draw. */
    loadGeometry() {
        const THREE = this.THREE;
        const box = new THREE.Box3();
        const group = new THREE.Group();

        this.api.StreamAllMeshes(this.ifcModelId, (mesh) => {
            const placed = mesh.geometries;
            for (let index = 0; index < placed.size(); index++) {
                const item = placed.get(index);
                const raw = this.api.GetGeometry(
                    this.ifcModelId, item.geometryExpressID);
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
                    color: new THREE.Color(colour.x, colour.y, colour.z),
                    transparent: colour.w !== 1,
                    opacity: colour.w,
                    side: THREE.DoubleSide,
                });
                const object = new THREE.Mesh(geometry, material);
                object.matrix.fromArray(item.flatTransformation);
                object.matrixAutoUpdate = false;
                object.userData.expressID = mesh.expressID;
                object.userData.baseColour = material.color.clone();
                group.add(object);

                const existing = this.meshesByExpressId.get(mesh.expressID) || [];
                existing.push(object);
                this.meshesByExpressId.set(mesh.expressID, existing);
                raw.delete();
            }
        });

        this.scene.add(group);
        this.modelGroup = group;
        box.setFromObject(group);
        this.indexStoreys();
        this.paintLinkedElements();
        this.modelBounds = box;
        return box;
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
            }
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
                meshes.some((m) => m.userData.isolatedOut || m.userData.storeyHidden);
            for (const mesh of meshes) {
                mesh.visible = !hidden;
            }
        }
        this.render();
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

    /** Orbit and zoom, written by hand rather than pulling in another library. */
    attachControls() {
        const canvas = this.canvasRef.el;
        let dragging = false;
        let last = { x: 0, y: 0 };

        canvas.addEventListener("pointerdown", (event) => {
            dragging = true;
            last = { x: event.clientX, y: event.clientY };
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener("pointerup", (event) => {
            dragging = false;
            canvas.releasePointerCapture(event.pointerId);
        });
        canvas.addEventListener("pointermove", (event) => {
            if (!dragging) {
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
            this.spherical.radius = Math.max(
                1, this.spherical.radius * (event.deltaY > 0 ? 1.12 : 0.89));
            this.updateCamera();
            this.render();
        }, { passive: false });
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
        };
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
        if (globalId) {
            rows.push({ label: _t("GlobalId"), value: globalId });
        }
        return rows;
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
            }],
        );
        if (pin && pin.id) {
            this.state.pins = [...this.state.pins, pin];
            this.drawPins();
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

    get visiblePins() {
        if (this.state.storey === "all") {
            return this.state.pins;
        }
        return this.state.pins.filter(
            (pin) => !pin.storey || pin.storey === this.state.storey);
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
        window.removeEventListener("resize", this.resize);
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
