from odoo import api, fields, models
from odoo.exceptions import AccessError


class MajalAdminAudit(models.Model):
    _name = "majal.admin.audit"
    _description = "Majal Administration Audit"
    _order = "create_date desc, id desc"

    event_type = fields.Selection(
        [
            ("user_invited", "User Created"),
            ("access_changed", "Access Changed"),
            ("user_deactivated", "User Deactivated"),
            ("user_reactivated", "User Reactivated"),
            ("backup_created", "Recovery Point Created"),
            ("backup_verified", "Recovery Point Verified"),
            ("restore_prepared", "Restore Prepared"),
            ("restore_cancelled", "Restore Cancelled"),
        ],
        required=True,
        index=True,
    )
    actor_id = fields.Many2one(
        "res.users",
        readonly=True,
        ondelete="set null",
    )
    actor_name = fields.Char(readonly=True)
    target_user_id = fields.Many2one(
        "res.users",
        readonly=True,
        ondelete="set null",
    )
    snapshot_id = fields.Many2one("majal.backup.snapshot", readonly=True)
    summary = fields.Char(required=True, readonly=True)
    company_id = fields.Many2one("res.company", required=True, readonly=True)

    @api.model
    def _log(self, event_type, summary, target_user=None, snapshot=None):
        return self.create(
            {
                "event_type": event_type,
                "actor_id": self.env.user.id,
                "actor_name": self.env.user.name,
                "target_user_id": target_user.id if target_user else False,
                "snapshot_id": snapshot.id if snapshot else False,
                "summary": summary,
                "company_id": self.env.company.id,
            }
        )

    def write(self, vals):
        raise AccessError("Administration audit entries are immutable.")

    def unlink(self):
        raise AccessError("Administration audit entries cannot be deleted.")
