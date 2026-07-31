from odoo import models
from odoo.tools import consteq


class DmsFile(models.Model):
    _inherit = "dms.file"

    def check_access_token(self, access_token=False):
        """Validate file tokens without inheriting the unsafe ancestor check.

        Directory-token sharing is disabled by default.  When an administrator
        explicitly enables it, a directory token may only open files in that
        directory or a real descendant.
        """
        self.ensure_one()
        if not access_token:
            return False
        if self.access_token and consteq(self.access_token, access_token):
            return True

        enabled = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("majal.documents.allow_directory_shares", "False")
        ).lower() in {"1", "true", "yes"}
        if not enabled:
            return False

        token_directory = (
            self.env["dms.directory"]
            .sudo()
            .search([("access_token", "=", access_token)], limit=1)
        )
        current = self.directory_id
        while token_directory and current:
            if current.id == token_directory.id:
                return True
            current = current.parent_id
        return False
