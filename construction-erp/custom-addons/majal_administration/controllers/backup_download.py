import os

from odoo import http
from odoo.exceptions import AccessError, UserError
from odoo.http import content_disposition, request
from werkzeug.wrappers import Response
from werkzeug.wsgi import wrap_file


class MajalBackupDownload(http.Controller):
    @http.route(
        "/majal/administration/backups/<int:snapshot_id>/download",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def download_backup(self, snapshot_id, **_kwargs):
        if not request.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError("Only a Platform Owner can export recovery archives.")
        snapshot = request.env["majal.backup.snapshot"].browse(snapshot_id).exists()
        if not snapshot or snapshot.state != "verified":
            raise UserError("This recovery point is not available for download.")
        path = snapshot._archive_path(snapshot.slot)
        if not os.path.isfile(path) or snapshot._hash_file(path) != snapshot.checksum:
            raise UserError("The recovery archive failed its download integrity check.")
        stream = open(path, "rb")
        filename = "majal-%s-%s.zip" % (
            snapshot.database_name,
            snapshot.backup_date.strftime("%Y%m%d-%H%M%S"),
        )
        return Response(
            wrap_file(request.httprequest.environ, stream),
            content_type="application/zip",
            content_length=os.path.getsize(path),
            direct_passthrough=True,
            headers=[
                ("Content-Disposition", content_disposition(filename)),
                ("X-Content-Type-Options", "nosniff"),
                ("Cache-Control", "no-store"),
            ],
        )
