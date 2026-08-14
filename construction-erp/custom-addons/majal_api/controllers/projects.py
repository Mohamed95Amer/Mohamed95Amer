import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class MajalProjectsApi(http.Controller):
    @http.route(
        "/api/v1/projects", type="http", auth="public", methods=["GET"],
        csrf=False, save_session=False,
    )
    def projects(self, **params):
        token = request.httprequest.headers.get("X-Majal-API-Key", "")
        client = request.env["majal.api.client"].sudo()._authenticate(token)
        if not client:
            return self._json({"error": "invalid_api_key"}, 401)
        if client.scope != "projects_read":
            return self._json({"error": "scope_not_allowed"}, 403)
        try:
            limit = int(params.get("limit", 50))
        except (TypeError, ValueError):
            return self._json({"error": "limit_must_be_an_integer"}, 400)
        if not 1 <= limit <= 100:
            return self._json({"error": "limit_must_be_between_1_and_100"}, 400)
        projects = request.env["project.project"].with_user(client.user_id).with_company(
            client.company_id
        ).search(
            [("is_construction", "=", True)],
            limit=limit,
            order="id asc",
        )
        return self._json({
            "data": [{
                "id": project.id,
                "name": project.name,
                "project_code": project.project_code,
                "stage": project.construction_stage,
                "type": project.project_type,
            } for project in projects],
            "count": len(projects),
        })

    @http.route(
        "/api/v1/documents", type="http", auth="public", methods=["GET"],
        csrf=False, save_session=False,
    )
    def documents(self, **params):
        token = request.httprequest.headers.get("X-Majal-API-Key", "")
        client = request.env["majal.api.client"].sudo()._authenticate(token)
        if not client:
            return self._json({"error": "invalid_api_key"}, 401)
        if client.scope != "documents_read":
            return self._json({"error": "scope_not_allowed"}, 403)
        try:
            limit = int(params.get("limit", 50))
        except (TypeError, ValueError):
            return self._json({"error": "limit_must_be_an_integer"}, 400)
        if not 1 <= limit <= 100:
            return self._json({"error": "limit_must_be_between_1_and_100"}, 400)
        documents = request.env["majal.document"].with_user(client.user_id).with_company(
            client.company_id
        ).search([], limit=limit, order="id asc")
        return self._json({
            "data": [{
                "id": document.id,
                "reference": document.reference,
                "name": document.name,
                "state": document.state,
                "revision": document.current_revision,
                "project_id": document.project_id.id or None,
            } for document in documents],
            "count": len(documents),
        })

    @staticmethod
    def _json(payload, status=200):
        return request.make_response(
            json.dumps(payload),
            headers=[("Content-Type", "application/json")],
            status=status,
        )
