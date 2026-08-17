from odoo import http
from odoo.http import request


class MajalAppAlias(http.Controller):
    """Keep branded backend URLs reloadable without changing core routes."""

    @http.route(
        ["/app", "/app/<path:subpath>"],
        type="http",
        auth="none",
        sitemap=False,
        csrf=False,
    )
    def majal_app_alias(self, subpath=None, **_params):
        target = "/odoo"
        if subpath:
            target = f"{target}/{subpath}"
        query_string = request.httprequest.query_string.decode("ascii", "ignore")
        if query_string:
            target = f"{target}?{query_string}"
        return request.redirect(target, code=302, local=True)
