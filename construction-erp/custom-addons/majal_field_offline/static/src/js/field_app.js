(function () {
    "use strict";

    const userKey = document.querySelector('meta[name="majal-user-key"]').content;
    const dbName = `majal-field-${userKey}`;
    let db;
    let snapshot = null;

    const $ = (selector) => document.querySelector(selector);
    const safe = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    function toast(message) {
        const element = $("#toast");
        element.textContent = message;
        element.classList.add("is-visible");
        window.clearTimeout(toast.timer);
        toast.timer = window.setTimeout(() => element.classList.remove("is-visible"), 2800);
    }

    function uuid() {
        if (crypto.randomUUID) return crypto.randomUUID().replaceAll("-", "_");
        return `${Date.now()}_${crypto.getRandomValues(new Uint32Array(4)).join("_")}`;
    }

    async function rpc(url, params = {}) {
        const response = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({jsonrpc: "2.0", method: "call", params, id: Date.now()}),
        });
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error.data?.message || data.error.message);
        return data.result;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("snapshot");
                request.result.createObjectStore("queue", {keyPath: "client_uuid"});
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function tx(store, mode, action) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(store, mode);
            const request = action(transaction.objectStore(store));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    const storeSnapshot = (value) => tx("snapshot", "readwrite", (store) => store.put(value, "current"));
    const readSnapshot = () => tx("snapshot", "readonly", (store) => store.get("current"));
    const queueAll = () => tx("queue", "readonly", (store) => store.getAll());
    const queuePut = (value) => tx("queue", "readwrite", (store) => store.put(value));
    const queueDelete = (key) => tx("queue", "readwrite", (store) => store.delete(key));
    const queueClear = () => tx("queue", "readwrite", (store) => store.clear());

    async function purgeOtherUsers() {
        const previous = localStorage.getItem("majal-field-db");
        if (previous && previous !== dbName) indexedDB.deleteDatabase(previous);
        localStorage.setItem("majal-field-db", dbName);
        if (indexedDB.databases) {
            const databases = await indexedDB.databases();
            for (const item of databases) {
                if (item.name?.startsWith("majal-field-") && item.name !== dbName) {
                    indexedDB.deleteDatabase(item.name);
                }
            }
        }
    }

    async function registerWorker() {
        if (!("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.register(
            "/majal/field/service-worker.js",
            {scope: "/majal/field/"}
        );
        const worker = registration.active || registration.waiting || registration.installing;
        worker?.postMessage({type: "SET_USER", userKey});
        navigator.serviceWorker.ready.then((ready) => {
            ready.active?.postMessage({type: "SET_USER", userKey});
        });
    }

    function updateNetwork() {
        const badge = $("#networkBadge");
        badge.textContent = navigator.onLine ? "● Online" : "○ Offline";
        badge.classList.toggle("is-offline", !navigator.onLine);
    }

    function empty(label) {
        return `<div class="mf-empty">${safe(label)}</div>`;
    }

    function renderMetrics() {
        const metrics = [
            [snapshot?.defects?.length || 0, "Assigned defects"],
            [snapshot?.inspections?.length || 0, "Inspections"],
            [snapshot?.workorders?.length || 0, "Work orders"],
            [snapshot?.drawings?.length || 0, "Saved drawings"],
        ];
        $("#metricGrid").innerHTML = metrics.map(([number, label]) =>
            `<div class="mf-metric"><strong>${number}</strong><span>${safe(label)}</span></div>`
        ).join("");
    }

    function renderDefects() {
        const records = snapshot?.defects || [];
        $("#defectList").innerHTML = records.length ? records.map((item) => `
            <article class="mf-item">
                <div class="mf-item-head">
                    <div><h3>${safe(item.reference)} · ${safe(item.name)}</h3>
                    <p>${safe(item.project)} · ${safe(item.location || "No location")}</p></div>
                    <span class="mf-badge ${safe(item.severity)}">${safe(item.severity)}</span>
                </div>
                <p>Status: ${safe(item.state.replaceAll("_", " "))}</p>
                <div class="mf-item-actions">
                    ${["open", "reopened"].includes(item.state)
                        ? `<button class="mf-small" data-defect-action="start" data-id="${item.id}">Start</button>` : ""}
                    ${["open", "in_progress", "reopened"].includes(item.state)
                        ? `<button class="mf-small" data-defect-action="ready" data-id="${item.id}">Ready for inspection</button>` : ""}
                </div>
            </article>`).join("") : empty("No assigned defects.");
    }

    function renderInspections() {
        const records = snapshot?.inspections || [];
        $("#inspectionList").innerHTML = records.length ? records.map((item) => `
            <article class="mf-item">
                <div class="mf-item-head"><div><h3>${safe(item.name)} · ${safe(item.template)}</h3>
                    <p>${safe(item.project)} · ${safe(item.scheduled_date || "")}</p></div>
                    <span class="mf-badge">${safe(item.state)}</span></div>
                ${(item.answers || []).slice(0, 12).map((answer) => `
                    <div class="mf-check">
                        <span>${safe(answer.question)}</span>
                        ${answer.type === "yes_no" ? `
                            <span class="mf-item-actions">
                                <button class="mf-small" data-answer="${answer.id}" data-value="yes" data-inspection="${item.id}">Yes</button>
                                <button class="mf-small" data-answer="${answer.id}" data-value="no" data-inspection="${item.id}">No</button>
                                <button class="mf-small" data-answer="${answer.id}" data-value="na" data-inspection="${item.id}">N/A</button>
                            </span>` : `<span class="mf-badge">${safe(answer.value || "Open online")}</span>`}
                    </div>`).join("")}
            </article>`).join("") : empty("No assigned inspections.");
    }

    function renderWorkorders() {
        const records = snapshot?.workorders || [];
        $("#workorderList").innerHTML = records.length ? records.map((item) => `
            <article class="mf-item">
                <div class="mf-item-head"><div><h3>${safe(item.name)}</h3>
                    <p>${safe(item.asset || "No asset")} · ${safe(item.stage)}</p></div>
                    <span class="mf-badge">${safe(item.stage)}</span></div>
                ${(item.checklist || []).map((task) => `
                    <label class="mf-check">
                        <input type="checkbox" data-check-task="${task.id}" data-workorder="${item.id}"
                               ${task.done ? "checked" : ""}/>
                        <span>${safe(task.name)}</span>
                    </label>`).join("")}
            </article>`).join("") : empty("No assigned work orders.");
    }

    function renderAssets() {
        const records = snapshot?.assets || [];
        $("#assetList").innerHTML = records.length ? records.map((item) => `
            <article class="mf-item">
                <div class="mf-item-head"><div><h3>${safe(item.code)} · ${safe(item.name)}</h3>
                    <p>${safe(item.location || "No location")}</p></div>
                    <span class="mf-badge ${safe(item.criticality)}">${safe(item.criticality)}</span></div>
                <div class="mf-item-actions">
                    <button class="mf-small" data-scan-asset="${item.id}">Record manual scan</button>
                </div>
            </article>`).join("") : empty("No assigned assets.");
    }

    function renderDrawings() {
        const records = snapshot?.drawings || [];
        $("#drawingList").innerHTML = records.length ? records.map((item) => `
            <article class="mf-item">
                <div class="mf-item-head"><div><h3>${safe(item.number)} · ${safe(item.name)}</h3>
                    <p>${safe(item.project)} · Revision ${safe(item.revision)}</p></div>
                    <span class="mf-badge">CURRENT</span></div>
                <div class="mf-item-actions">
                    ${item.content_url
                        ? `<button class="mf-small" data-save-drawing="${safe(item.content_url)}">Save PDF offline</button>
                           <a class="mf-small" href="${safe(item.content_url)}" target="_blank" rel="noopener">Open</a>`
                        : `<span class="mf-badge">No PDF</span>`}
                </div>
            </article>`).join("") : empty("No current drawings.");
    }

    async function renderQueue() {
        const records = await queueAll();
        $("#queueSummary").textContent = `${records.length} change${records.length === 1 ? "" : "s"} waiting`;
        $("#queueList").innerHTML = records.length ? records.map((item) => `
            <div class="mf-item">
                <div class="mf-item-head">
                    <div><h3>${safe(item.kind.replaceAll(".", " "))}</h3>
                    <p>${safe(item.error || "Waiting to sync")}</p></div>
                    <span class="mf-badge ${safe(item.status || "waiting")}">${safe(item.status || "waiting")}</span>
                </div>
                <div class="mf-item-actions">
                    <button class="mf-small" data-discard="${safe(item.client_uuid)}">Discard</button>
                </div>
            </div>`).join("") : empty("Everything on this device is synchronized.");
    }

    function renderAll() {
        renderMetrics();
        renderDefects();
        renderInspections();
        renderWorkorders();
        renderAssets();
        renderDrawings();
        if (snapshot?.generated_at) {
            $("#lastUpdated").textContent = `Field pack updated ${snapshot.generated_at} UTC`;
        }
        const projects = snapshot?.projects || [];
        for (const select of [$("#defectProject"), $("#dailyProject")]) {
            select.innerHTML = projects.map((item) =>
                `<option value="${item.id}">${safe(item.code ? `${item.code} · ${item.name}` : item.name)}</option>`
            ).join("");
        }
        renderQueue();
    }

    async function refresh() {
        if (navigator.onLine) {
            try {
                snapshot = await rpc("/majal/field/api/bootstrap");
                await storeSnapshot(snapshot);
            } catch (error) {
                snapshot = await readSnapshot();
                toast(`Using saved field pack: ${error.message}`);
            }
        } else {
            snapshot = await readSnapshot();
        }
        snapshot ||= {projects: [], defects: [], inspections: [], workorders: [], assets: [], drawings: []};
        renderAll();
    }

    async function enqueue(kind, payload, details = {}) {
        await queuePut({
            client_uuid: uuid(),
            kind,
            payload,
            target_model: details.target_model || "",
            target_id: details.target_id || 0,
            base_write_date: details.base_write_date || false,
            created_at: new Date().toISOString(),
            status: "waiting",
        });
        await renderQueue();
        toast("Saved on this device. Sync when a connection is available.");
    }

    async function syncNow() {
        if (!navigator.onLine) return toast("You are offline. Changes remain safely queued.");
        const button = $("#syncNow");
        const records = await queueAll();
        if (!records.length) {
            await refresh();
            return toast("Field pack is up to date.");
        }
        button.disabled = true;
        button.textContent = "Syncing…";
        try {
            const response = await rpc("/majal/field/api/sync", {operations: records});
            for (const result of response.results) {
                if (result.status === "applied") {
                    await queueDelete(result.client_uuid);
                } else {
                    const item = records.find((record) => record.client_uuid === result.client_uuid);
                    if (item) {
                        item.status = result.status;
                        item.error = result.result?.error || result.error || "Needs attention";
                        await queuePut(item);
                    }
                }
            }
            await refresh();
            toast("Sync completed. Review any conflicts still shown.");
        } catch (error) {
            toast(`Sync paused: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = "Sync now";
            await renderQueue();
        }
    }

    // ------------------------------------------------------------------
    // Going back
    //
    // On a phone this is not a nicety. The app is a single page, so the
    // device's own back gesture left Majal Field entirely — a technician
    // three fields into a defect swiped back out of the app and lost the
    // form. Tabs and dialogs now push a history entry, so back closes the
    // dialog or returns to Overview, and only leaves once there is nothing
    // left to leave. The header button runs the same path so the two can
    // never disagree.
    // ------------------------------------------------------------------
    const openDialog = () => Array.from(document.querySelectorAll("dialog"))
        .find((item) => item.open);

    function showTab(name) {
        document.querySelectorAll("[data-tab]").forEach(
            (item) => item.classList.toggle("is-active", item.dataset.tab === name));
        document.querySelectorAll(".mf-panel").forEach(
            (item) => item.classList.toggle("is-active", item.id === name));
        const back = document.getElementById("backButton");
        if (back) back.hidden = name === "overview";
    }

    function currentTab() {
        const active = document.querySelector(".mf-panel.is-active");
        return active ? active.id : "overview";
    }

    function goDeeper(state) {
        // A guard rather than an assumption: history is unavailable in some
        // embedded webviews, and a back button that throws is worse than one
        // that only works from the header.
        try {
            window.history.pushState(state, "");
        } catch (error) {
            /* the header button still works */
        }
    }

    function goBack() {
        const dialog = openDialog();
        if (dialog) {
            dialog.close();
            return true;
        }
        if (currentTab() !== "overview") {
            showTab("overview");
            return true;
        }
        return false;
    }

    window.addEventListener("popstate", () => {
        // Nothing left to unwind: put the entry back so the next gesture
        // does not skip past the app into whatever preceded it.
        if (!goBack()) goDeeper({depth: 0});
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest("#backButton")) return;
        if (window.history.state) window.history.back();
        else goBack();
    });

    document.addEventListener("click", async (event) => {
        const tab = event.target.closest("[data-tab]");
        if (tab) {
            const name = tab.dataset.tab;
            if (name !== currentTab() && name !== "overview") goDeeper({tab: name});
            showTab(name);
        }
        const defectAction = event.target.closest("[data-defect-action]");
        if (defectAction) {
            const item = snapshot.defects.find((record) => record.id === Number(defectAction.dataset.id));
            await enqueue("defect.progress", {record_id: item.id, action: defectAction.dataset.defectAction}, {
                target_model: "construction.defect", target_id: item.id, base_write_date: item.write_date,
            });
        }
        const answerButton = event.target.closest("[data-answer]");
        if (answerButton) {
            const inspection = snapshot.inspections.find((item) => item.id === Number(answerButton.dataset.inspection));
            await enqueue("inspection.answer", {
                answer_id: Number(answerButton.dataset.answer), value: answerButton.dataset.value,
            }, {target_model: "construction.form.inspection", target_id: inspection.id, base_write_date: inspection.write_date});
        }
        const scan = event.target.closest("[data-scan-asset]");
        if (scan) await enqueue("asset.scan", {equipment_id: Number(scan.dataset.scanAsset), source: "manual"});
        const drawing = event.target.closest("[data-save-drawing]");
        if (drawing) {
            try {
                const response = await fetch(drawing.dataset.saveDrawing, {credentials: "same-origin"});
                if (!response.ok) throw new Error("PDF was not available");
                toast("Drawing saved for offline opening.");
            } catch (error) { toast(error.message); }
        }
        const discard = event.target.closest("[data-discard]");
        if (discard) {
            await queueDelete(discard.dataset.discard);
            await renderQueue();
        }
        const closeDialog = event.target.closest("[data-close-dialog]");
        if (closeDialog) document.getElementById(closeDialog.dataset.closeDialog).close();
    });

    document.addEventListener("change", async (event) => {
        const checkbox = event.target.closest("[data-check-task]");
        if (!checkbox) return;
        const workorder = snapshot.workorders.find((item) => item.id === Number(checkbox.dataset.workorder));
        await enqueue("workorder.checklist", {
            task_id: Number(checkbox.dataset.checkTask), done: checkbox.checked,
        }, {target_model: "maintenance.request", target_id: workorder.id, base_write_date: workorder.write_date});
    });

    // Both dialogs push an entry, so the device's back gesture closes the
    // form rather than leaving the app with the form half filled in.
    $("#openDefect").addEventListener("click", () => {
        goDeeper({dialog: "defectDialog"});
        $("#defectDialog").showModal();
    });
    $("#openDailyLog").addEventListener("click", () => {
        $("#dailyLogForm").elements.log_date.value = new Date().toISOString().slice(0, 10);
        goDeeper({dialog: "dailyLogDialog"});
        $("#dailyLogDialog").showModal();
    });
    $("#defectForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.target));
        data.project_id = Number(data.project_id);
        await enqueue("defect.create", data);
        event.target.reset();
        $("#defectDialog").close();
    });
    $("#dailyLogForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.target));
        data.project_id = Number(data.project_id);
        await enqueue("daily_log.create", data);
        event.target.reset();
        $("#dailyLogDialog").close();
    });
    $("#syncNow").addEventListener("click", syncNow);
    $("#clearDevice").addEventListener("click", async () => {
        if (!window.confirm("Remove saved field data and unsynchronized changes from this device?")) return;
        await queueClear();
        db.close();
        indexedDB.deleteDatabase(dbName);
        if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                if (registration.scope.includes("/majal/field/")) await registration.unregister();
            }
        }
        location.reload();
    });

    window.addEventListener("online", () => { updateNetwork(); syncNow(); });
    window.addEventListener("offline", updateNetwork);

    (async function start() {
        updateNetwork();
        await purgeOtherUsers();
        db = await openDb();
        await registerWorker();
        await refresh();
    })().catch((error) => {
        $("#lastUpdated").textContent = "Field workspace needs attention";
        toast(error.message);
    });
})();
