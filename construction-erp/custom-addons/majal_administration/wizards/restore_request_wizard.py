import hashlib
import json
import os
import secrets
from datetime import timedelta

from odoo import _, fields, models
from odoo.exceptions import UserError, ValidationError


class MajalRestoreRequestWizard(models.TransientModel):
    _name = "majal.restore.request.wizard"
    _description = "Prepare Protected Majal Restore"

    snapshot_id = fields.Many2one(
        "majal.backup.snapshot", required=True, readonly=True
    )
    database_confirmation = fields.Char(
        string="Type the database name",
        help="This confirms which protected client database will be restored.",
    )
    loss_confirmation = fields.Char(
        string="Type RESTORE ERP",
        help="A restore replaces all changes made after the selected recovery point.",
    )
    state = fields.Selection(
        [("confirm", "Confirm"), ("ready", "Ready")],
        default="confirm",
        required=True,
    )
    recovery_code = fields.Char(readonly=True)
    operator_command = fields.Text(readonly=True)
    expires_at = fields.Datetime(readonly=True)

    def action_prepare(self):
        self.ensure_one()
        snapshot = self.snapshot_id
        if snapshot.state != "verified":
            raise UserError(_("Only verified recovery points can be restored."))
        if self.database_confirmation != snapshot.database_name:
            raise ValidationError(_("The database name does not match."))
        if (self.loss_confirmation or "").strip().upper() != "RESTORE ERP":
            raise ValidationError(_("Type RESTORE ERP exactly to continue."))

        code = secrets.token_urlsafe(12)
        token_hash = hashlib.sha256(code.encode()).hexdigest()
        expires_at = fields.Datetime.now() + timedelta(hours=2)
        existing = self.env["majal.restore.request"].search(
            [("state", "=", "prepared")]
        )
        if existing:
            existing.action_cancel()
        request_record = self.env["majal.restore.request"].create(
            {
                "name": "RESTORE-%s" % fields.Datetime.now().strftime("%Y%m%d-%H%M%S"),
                "snapshot_id": snapshot.id,
                "token_hash": token_hash,
                "expires_at": expires_at,
            }
        )
        marker = {
            "request_id": request_record.id,
            "database": snapshot.database_name,
            "slot": snapshot.slot,
            "archive": snapshot.archive_name,
            "checksum": snapshot.checksum,
            "token_hash": token_hash,
            "expires_at": expires_at.isoformat(),
        }
        marker_name = "restore-request-%s.json" % request_record.id
        request_record.write({"marker_name": marker_name})
        marker_path = os.path.join(snapshot._backup_root(), marker_name)
        temporary = marker_path + ".new"
        with open(temporary, "w", encoding="utf-8") as marker_stream:
            json.dump(marker, marker_stream, indent=2, sort_keys=True)
        os.chmod(temporary, 0o600)
        os.replace(temporary, marker_path)

        command = (
            "powershell -ExecutionPolicy Bypass "
            "-File scripts\\restore-majal.ps1 "
            "-RequestId %s -Slot %s -Code %s"
            % (request_record.id, snapshot.slot, code)
        )
        self.write(
            {
                "state": "ready",
                "recovery_code": code,
                "operator_command": command,
                "expires_at": expires_at,
            }
        )
        self.env["majal.admin.audit"]._log(
            "restore_prepared",
            _("Protected restore prepared from %s.") % snapshot.display_name,
            snapshot=snapshot,
        )
        return {
            "type": "ir.actions.act_window",
            "res_model": self._name,
            "res_id": self.id,
            "view_mode": "form",
            "target": "new",
        }
