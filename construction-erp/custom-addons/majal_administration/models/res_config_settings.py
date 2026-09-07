from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    majal_backup_min_free_mb = fields.Integer(
        string="Minimum free storage (MB)",
        config_parameter="majal.backup_min_free_mb",
        default=512,
    )

    @api.constrains("majal_backup_min_free_mb")
    def _check_majal_backup_min_free_mb(self):
        for settings in self:
            if not 64 <= settings.majal_backup_min_free_mb <= 1048576:
                raise ValidationError(
                    _("Minimum free storage must be between 64 MB and 1 TB.")
                )

    def action_open_majal_users(self):
        return self.env["res.users"].action_open_majal_client_users()

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
