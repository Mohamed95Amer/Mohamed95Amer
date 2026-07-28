from urllib.parse import urlencode

from odoo import http, tools
from odoo.http import request
from odoo.addons.web.controllers.database import Database


class MajalDatabase(Database):
    """Keep public users out of the technical database-management surface."""

    def _majal_login(self):
        # Majal is shipped as a single-database product. The database manager
        # is disabled in production, so its selector cannot help the user and
        # must not become an Odoo-branded dead end.
        configured = tools.config.get("db_name") or "erp"
        if isinstance(configured, (list, tuple)):
            database = configured[0]
        else:
            database = str(configured).split(",", maxsplit=1)[0]
        return request.redirect(
            f"/web/login?{urlencode({'db': database})}",
            code=303,
        )

    @http.route("/web/database/selector", type="http", auth="none")
    def selector(self, **kwargs):
        return self._majal_login()

    @http.route("/web/database/manager", type="http", auth="none")
    def manager(self, **kwargs):
        return self._majal_login()
