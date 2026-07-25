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
        });

        this.linkedByGlobalId = new Map();
        this.meshesByExpressId = new Map();

        onWillStart(async () => {
            this.state.info = await this.orm.call(
                "construction.bim.model", "viewer_payload", [this.modelId]);
            for (const element of this.state.info.linked || []) {
                this.linkedByGlobalId.set(element.global_id, element);
            }
            this.state.elements = this.state.info.linked || [];
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
        this.paintLinkedElements();
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
        const hits = this.raycaster.intersectObjects(this.modelGroup.children, false);
        if (!hits.length) {
            this.state.selected = null;
            return;
        }
        const expressID = hits[0].object.userData.expressID;
        const globalId = hits[0].object.userData.globalId || this.globalIdOf(expressID);
        this.state.selected = {
            expressID,
            globalId,
            element: globalId ? this.linkedByGlobalId.get(globalId) : null,
        };
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
        if (this.state.filter === "all") {
            return this.state.elements;
        }
        return this.state.elements.filter(
            (e) => e.link_bucket === this.state.filter);
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
