from odoo import _, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    majal_backup_min_free_mb = fields.Integer(
        string="Minimum free storage (MB)",
        config_parameter="majal.backup_min_free_mb",
        default=512,
    )

    def action_open_majal_users(self):
        return self.env.ref(
            "majal_administration.action_majal_client_users"
        ).read()[0]

    def action_open_majal_backups(self):
        return self.env.ref(
            "majal_administration.action_majal_backup_snapshots"
        ).read()[0]

    def action_majal_backup_now(self):
        snapshot = self.env["majal.backup.snapshot"].create_recovery_point()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Verified recovery point ready"),
                "message": _("%s was protected and verified.") % snapshot.name,
                "type": "success",
                "sticky": False,
                "next": self.action_open_majal_backups(),
            },
        }
