import json

from odoo import fields, http
from odoo.http import request


SERVICE_WORKER = r"""
const PREFIX = "majal-field-v1-";
let cacheName = null;

self.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "SET_USER") return;
    cacheName = PREFIX + String(event.data.userKey);
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.filter((name) => name.startsWith(PREFIX) && name !== cacheName)
                 .map((name) => caches.delete(name))
        ))
    );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
    if (!cacheName || event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname === "/majal/field/") {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(cacheName).then((cache) => cache.put("/majal/field/", copy));
                    }
                    return response;
                })
                .catch(() => caches.open(cacheName).then((cache) => cache.match("/majal/field/")))
        );
        return;
    }
    if (url.pathname.startsWith("/majal_field_offline/static/") ||
        url.pathname.startsWith("/web/content/")) {
        event.respondWith(
            caches.open(cacheName).then(async (cache) => {
                const saved = await cache.match(event.request);
                if (saved) return saved;
                const response = await fetch(event.request);
                if (response.ok) await cache.put(event.request, response.clone());
                return response;
            })
        );
    }
});
"""


def _dt(value):
    return fields.Datetime.to_string(value) if value else False


def _construction_field_records(env, user):
    """Return construction-only field records without probing forbidden models."""
    model_names = {
        "projects": "project.project",
        "defects": "construction.defect",
        "inspections": "construction.form.inspection",
        "drawings": "construction.drawing",
    }
    if not user.has_group("construction_base.group_construction_user"):
        return {
            key: env[model_name].browse()
            for key, model_name in model_names.items()
        }

    projects = env["project.project"].search(
        [("is_construction", "=", True)],
        limit=80,
        order="name",
    )
    return {
        "projects": projects,
        "defects": env["construction.defect"].search(
            [
                ("assigned_user_id", "=", user.id),
                ("state", "in", ["open", "in_progress", "reopened", "ready"]),
            ],
            limit=100,
            order="severity desc, date_required, id desc",
        ),
        "inspections": env["construction.form.inspection"].search(
            [
                ("inspector_id", "=", user.id),
                ("state", "in", ["draft", "in_progress", "rejected"]),
            ],
            limit=60,
            order="scheduled_date, id",
        ),
        "drawings": env["construction.drawing"].search(
            [
                ("project_id", "in", projects.ids),
                ("current_revision_id", "!=", False),
            ],
            limit=80,
            order="project_id, number",
        ),
    }


class MajalFieldApp(http.Controller):
    @http.route(
        ["/majal/field", "/majal/field/"],
        type="http",
        auth="user",
        methods=["GET"],
    )
    def field_app(self):
        return request.render(
            "majal_field_offline.field_app",
            {
                "user_key": request.env.user.id,
                "user_name": request.env.user.name,
                "company_name": request.env.company.name,
                "user_lang": request.env.user.lang or "en_US",
                "is_arabic": (request.env.user.lang or "").startswith("ar"),
            },
        )

    @http.route(
        "/majal/field/service-worker.js",
        type="http",
        auth="user",
        methods=["GET"],
    )
    def service_worker(self):
        return request.make_response(
            SERVICE_WORKER,
            headers=[
                ("Content-Type", "application/javascript; charset=utf-8"),
                ("Service-Worker-Allowed", "/majal/field/"),
                ("Cache-Control", "no-cache"),
                ("X-Content-Type-Options", "nosniff"),
            ],
        )

    @http.route(
        "/majal/field/api/bootstrap",
        type="json",
        auth="user",
        methods=["POST"],
    )
    def bootstrap(self):
        env = request.env
        user = env.user
        construction_records = _construction_field_records(env, user)
        projects = construction_records["projects"]
        defects = construction_records["defects"]
        inspections = construction_records["inspections"]
        workorders = env["maintenance.request"].search(
            [("user_id", "=", user.id)],
            limit=100,
            order="request_date desc, id desc",
        )
        assets = env["maintenance.equipment"].search(
            [
                "|",
                ("technician_user_id", "=", user.id),
                ("owner_user_id", "=", user.id),
                ("tag_status", "=", "active"),
            ],
            limit=120,
            order="name",
        )
        drawings = construction_records["drawings"]

        return {
            "generated_at": _dt(fields.Datetime.now()),
            "user": {
                "id": user.id,
                "name": user.name,
                "company": env.company.name,
            },
            "projects": [
                {
                    "id": record.id,
                    "name": record.name,
                    "code": record.project_code or "",
                    "write_date": _dt(record.write_date),
                }
                for record in projects
            ],
            "defects": [
                {
                    "id": record.id,
                    "reference": record.reference,
                    "name": record.name,
                    "project": record.project_id.name,
                    "location": record.location or "",
                    "severity": record.severity,
                    "state": record.state,
                    "write_date": _dt(record.write_date),
                }
                for record in defects
            ],
            "inspections": [
                {
                    "id": record.id,
                    "name": record.name,
                    "template": record.template_id.name,
                    "project": record.project_id.name,
                    "state": record.state,
                    "scheduled_date": fields.Date.to_string(record.scheduled_date),
                    "write_date": _dt(record.write_date),
                    "answers": [
                        {
                            "id": answer.id,
                            "question": answer.question_id.name,
                            "type": answer.answer_type,
                            "value": (
                                answer.answer_yes_no
                                or answer.answer_text
                                or answer.answer_number
                                or answer.answer_date
                                or False
                            ),
                            "comment": answer.comment or "",
                        }
                        for answer in record.answer_ids
                        if answer.answer_type in ("yes_no", "text", "number", "date")
                    ],
                }
                for record in inspections
            ],
            "workorders": [
                {
                    "id": record.id,
                    "name": record.name,
                    "asset": record.equipment_id.name or "",
                    "stage": record.stage_id.name or "",
                    "description": record.description or "",
                    "labor_hours": record.labor_hours,
                    "write_date": _dt(record.write_date),
                    "checklist": [
                        {"id": task.id, "name": task.name, "done": task.done}
                        for task in record.checklist_ids
                    ],
                }
                for record in workorders
            ],
            "assets": [
                {
                    "id": record.id,
                    "name": record.name,
                    "code": record.barcode or "",
                    "location": record.facility_location_id.name or "",
                    "criticality": record.criticality,
                    "write_date": _dt(record.write_date),
                }
                for record in assets
            ],
            "drawings": [
                {
                    "id": record.id,
                    "number": record.number,
                    "name": record.name,
                    "project": record.project_id.name,
                    "revision": record.current_revision_id.revision,
                    "content_url": (
                        "/web/content/%s?download=0"
                        % record.current_revision_id.attachment_id.id
                        if record.current_revision_id.attachment_id
                        else False
                    ),
                }
                for record in drawings
            ],
        }

    @http.route(
        "/majal/field/api/sync",
        type="json",
        auth="user",
        methods=["POST"],
    )
    def sync(self, operations=None):
        results = request.env["majal.offline.operation"]._sync_batch(
            operations or []
        )
        return {
            "results": results,
            "server_time": _dt(fields.Datetime.now()),
        }
