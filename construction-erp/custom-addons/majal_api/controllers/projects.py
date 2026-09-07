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

    @http.route(
        "/api/v1/search", type="http", auth="public", methods=["GET"],
        csrf=False, save_session=False,
    )
    def search(self, **params):
        token = request.httprequest.headers.get("X-Majal-API-Key", "")
        client = request.env["majal.api.client"].sudo()._authenticate(token)
        if not client:
            return self._json({"error": "invalid_api_key"}, 401)
        if client.scope != "search_read":
            return self._json({"error": "scope_not_allowed"}, 403)
        query = (params.get("q") or "").strip()
        if len(query) < 2:
            return self._json({"error": "q_must_contain_at_least_2_characters"}, 400)
        try:
            limit = int(params.get("limit", 25))
        except (TypeError, ValueError):
            return self._json({"error": "limit_must_be_an_integer"}, 400)
        if not 1 <= limit <= 100:
            return self._json({"error": "limit_must_be_between_1_and_100"}, 400)
        env = request.env
        project_env = env["project.project"].with_user(client.user_id).with_company(
            client.company_id
        )
        document_env = env["majal.document"].with_user(client.user_id).with_company(
            client.company_id
        )
        projects = project_env.search([
            ("is_construction", "=", True),
            "|", ("name", "ilike", query), ("project_code", "ilike", query),
        ], limit=limit, order="id asc")
        documents = document_env.search([
            "|", ("name", "ilike", query), ("reference", "ilike", query),
        ], limit=limit, order="id asc")
        rows = ([{
            "type": "project", "id": project.id,
            "title": project.name, "reference": project.project_code,
            "state": project.construction_stage,
        } for project in projects] + [{
            "type": "document", "id": document.id,
            "title": document.name, "reference": document.reference,
            "state": document.state,
        } for document in documents])[:limit]
        return self._json({"query": query, "data": rows, "count": len(rows)})

    @staticmethod
    def _json(payload, status=200):
        return request.make_response(
            json.dumps(payload),
            headers=[("Content-Type", "application/json")],
            status=status,
        )
