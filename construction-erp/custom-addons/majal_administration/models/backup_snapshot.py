import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import zipfile
from datetime import timedelta

import odoo
from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.service.db import exec_pg_environ, find_pg_tool


_logger = logging.getLogger(__name__)

SLOT_SELECTION = [
    ("today", "Today"),
    ("yesterday", "Yesterday"),
    ("day_before", "Day before yesterday"),
    ("weekly", "Weekly checkpoint"),
    ("fortnight", "Two-week checkpoint"),
    ("monthly", "Monthly checkpoint"),
    ("quarterly", "Three-month checkpoint"),
]
SLOT_SEQUENCE = {code: index for index, (code, _name) in enumerate(SLOT_SELECTION)}


class MajalBackupSnapshot(models.Model):
    _name = "majal.backup.snapshot"
    _description = "Majal Verified Recovery Point"
    _order = "slot_sequence, backup_date desc"

    name = fields.Char(required=True, readonly=True)
    slot = fields.Selection(SLOT_SELECTION, required=True, readonly=True, index=True)
    slot_label = fields.Char(
        string="Recovery point",
        compute="_compute_slot_label",
    )
    slot_sequence = fields.Integer(compute="_compute_slot_sequence", store=True)
    state = fields.Selection(
        [
            ("empty", "Awaiting schedule"),
            ("pending", "Preparing"),
            ("verified", "Verified"),
            ("error", "Needs Attention"),
        ],
        default="empty",
        required=True,
        readonly=True,
        index=True,
    )
    backup_date = fields.Datetime(readonly=True, index=True)
    database_name = fields.Char(readonly=True)
    archive_name = fields.Char(readonly=True)
    checksum = fields.Char(string="SHA-256", readonly=True)
    size_bytes = fields.Integer(readonly=True)
    size_display = fields.Char(string="Archive size", compute="_compute_size_display")
    age_display = fields.Char(string="Age", compute="_compute_age_display")
    verified_at = fields.Datetime(readonly=True)
    created_by_id = fields.Many2one("res.users", readonly=True)
    release_version = fields.Char(readonly=True)
    module_count = fields.Integer(readonly=True)
    error_message = fields.Text(readonly=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        readonly=True,
    )

    _sql_constraints = [
        ("majal_backup_slot_unique", "unique(slot)", "Only one recovery point is retained per slot."),
    ]

    @api.depends("slot")
    def _compute_slot_sequence(self):
        for record in self:
            record.slot_sequence = SLOT_SEQUENCE.get(record.slot, 99)

    @api.depends("slot")
    def _compute_slot_label(self):
        labels = dict(self._fields["slot"]._description_selection(self.env))
        for record in self:
            record.slot_label = labels.get(record.slot, record.name)

    @api.depends("size_bytes")
    def _compute_size_display(self):
        for record in self:
            size = float(record.size_bytes or 0)
            unit = "B"
            for candidate in ("KB", "MB", "GB", "TB"):
                if size < 1024:
                    break
                size /= 1024
                unit = candidate
            record.size_display = "%.1f %s" % (size, unit) if size else "—"

    @api.depends("backup_date")
    def _compute_age_display(self):
        now = fields.Datetime.now()
        for record in self:
            if not record.backup_date:
                record.age_display = _("Not created yet")
                continue
            delta = now - record.backup_date
            if delta.days:
                record.age_display = _("%s day(s) ago") % delta.days
            else:
                hours = max(0, int(delta.total_seconds() // 3600))
                record.age_display = _("Today, %s hour(s) ago") % hours

    @api.model
    def _backup_root(self):
        configured = (
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("majal.backup_root", "")
            .strip()
        )
        data_dir = os.path.realpath(odoo.tools.config["data_dir"])
        root = os.path.realpath(configured or os.path.join(data_dir, "majal_backups"))
        if root != data_dir and not root.startswith(data_dir + os.sep):
            raise ValidationError(
                _("The recovery directory must be inside the protected Majal data volume.")
            )
        os.makedirs(root, mode=0o700, exist_ok=True)
        return root

    @api.model
    def _ensure_slots(self):
        existing = set(self.sudo().search([]).mapped("slot"))
        for slot, label in SLOT_SELECTION:
            if slot not in existing:
                self.sudo().create(
                    {
                        "name": label,
                        "slot": slot,
                        "state": "empty",
                        "database_name": self.env.cr.dbname,
                        "company_id": self.env.company.id,
                    }
                )
        return True

    @api.model
    def _archive_path(self, slot):
        if slot not in SLOT_SEQUENCE:
            raise ValidationError(_("Unknown recovery point slot."))
        return os.path.join(self._backup_root(), "%s.zip" % slot)

    @api.model
    def _manifest(self):
        self.env.cr.execute(
            "SELECT name, latest_version FROM ir_module_module "
            "WHERE state = 'installed' ORDER BY name"
        )
        modules = dict(self.env.cr.fetchall())
        self.env.cr.execute("SHOW server_version")
        return {
            "majal_backup": "1",
            "database": self.env.cr.dbname,
            "created_at": fields.Datetime.now().isoformat(),
            "platform_version": odoo.release.version,
            "postgres_version": self.env.cr.fetchone()[0],
            "modules": modules,
        }

    @api.model
    def _hash_file(self, path):
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @api.model
    def _build_archive(self, destination):
        root = self._backup_root()
        minimum_free_mb = int(
            self.env["ir.config_parameter"]
            .sudo()
            .get_param("majal.backup_min_free_mb", "512")
        )
        if shutil.disk_usage(root).free < minimum_free_mb * 1024 * 1024:
            raise UserError(
                _("There is not enough free protected storage to create a recovery point.")
            )

        with tempfile.TemporaryDirectory(prefix="majal-backup-", dir=root) as work:
            dump_path = os.path.join(work, "dump.sql")
            manifest_path = os.path.join(work, "manifest.json")
            staged_archive = os.path.join(work, "recovery.zip")
            with open(manifest_path, "w", encoding="utf-8") as manifest_stream:
                json.dump(self._manifest(), manifest_stream, indent=2, sort_keys=True)

            command = [
                find_pg_tool("pg_dump"),
                "--no-owner",
                "--no-privileges",
                "--file=%s" % dump_path,
                self.env.cr.dbname,
            ]
            result = subprocess.run(
                command,
                env=exec_pg_environ(),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                check=False,
                timeout=odoo.tools.config.get("limit_time_real", 120),
            )
            if result.returncode:
                message = result.stderr.decode("utf-8", errors="replace")[-1500:]
                raise UserError(_("Database export failed: %s") % message)

            filestore = odoo.tools.config.filestore(self.env.cr.dbname)
            with zipfile.ZipFile(
                staged_archive,
                "w",
                compression=zipfile.ZIP_DEFLATED,
                allowZip64=True,
            ) as archive:
                archive.write(dump_path, "dump.sql")
                archive.write(manifest_path, "manifest.json")
                if os.path.isdir(filestore):
                    for directory, _subdirs, files in os.walk(filestore):
                        for filename in files:
                            source = os.path.join(directory, filename)
                            relative = os.path.relpath(source, filestore)
                            archive.write(source, os.path.join("filestore", relative))

            with zipfile.ZipFile(staged_archive, "r") as archive:
                names = set(archive.namelist())
                if {"dump.sql", "manifest.json"} - names or archive.testzip():
                    raise UserError(_("The recovery archive failed its integrity test."))

            os.chmod(staged_archive, 0o600)
            os.replace(staged_archive, destination)
            os.chmod(destination, 0o600)

        return self._hash_file(destination), os.path.getsize(destination)

    @api.model
    def _copy_slot(self, source_slot, target_slot):
        source = self.search(
            [("slot", "=", source_slot), ("state", "=", "verified")], limit=1
        )
        if not source:
            return False
        source_path = self._archive_path(source_slot)
        if not os.path.isfile(source_path):
            return False
        target_path = self._archive_path(target_slot)
        temporary = target_path + ".new"
        shutil.copy2(source_path, temporary)
        os.replace(temporary, target_path)
        values = {
            "name": dict(SLOT_SELECTION)[target_slot],
            "state": "verified",
            "backup_date": source.backup_date,
            "database_name": source.database_name,
            "archive_name": os.path.basename(target_path),
            "checksum": source.checksum,
            "size_bytes": source.size_bytes,
            "verified_at": fields.Datetime.now(),
            "created_by_id": source.created_by_id.id,
            "release_version": source.release_version,
            "module_count": source.module_count,
            "error_message": False,
            "company_id": source.company_id.id,
        }
        target = self.sudo().search([("slot", "=", target_slot)], limit=1)
        if target:
            target.sudo().write(values)
        else:
            values["slot"] = target_slot
            target = self.sudo().create(values)
        return target

    @api.model
    def _rotate_daily_slots(self, today):
        current = self.sudo().search([("slot", "=", "today")], limit=1)
        if current and current.backup_date and current.backup_date.date() < today:
            self._copy_slot("yesterday", "day_before")
            self._copy_slot("today", "yesterday")

    @api.model
    def create_recovery_point(self):
        if not self.env.user.has_group(
            "majal_administration.group_backup_operator"
        ):
            raise AccessError(_("You are not allowed to create recovery points."))
        self.env.cr.execute(
            "SELECT pg_try_advisory_lock(hashtext('majal_verified_backup'))"
        )
        if not self.env.cr.fetchone()[0]:
            raise UserError(_("Another recovery point is already being prepared."))

        today = fields.Date.context_today(self)
        try:
            self._rotate_daily_slots(today)
            destination = self._archive_path("today")
            checksum, size = self._build_archive(destination)
            module_count = self.env["ir.module.module"].sudo().search_count(
                [("state", "=", "installed")]
            )
            values = {
                "name": dict(SLOT_SELECTION)["today"],
                "state": "verified",
                "backup_date": fields.Datetime.now(),
                "database_name": self.env.cr.dbname,
                "archive_name": os.path.basename(destination),
                "checksum": checksum,
                "size_bytes": size,
                "verified_at": fields.Datetime.now(),
                "created_by_id": self.env.user.id,
                "release_version": odoo.release.version,
                "module_count": module_count,
                "error_message": False,
                "company_id": self.env.company.id,
            }
            snapshot = self.sudo().search([("slot", "=", "today")], limit=1)
            if snapshot:
                snapshot.sudo().write(values)
            else:
                values["slot"] = "today"
                snapshot = self.sudo().create(values)

            # Periodic slots are copies of the single verified daily archive.
            # This avoids running multiple large database exports on boundary days.
            if today.weekday() == 0:
                self._copy_slot("today", "weekly")
                if today.isocalendar().week % 2 == 0:
                    self._copy_slot("today", "fortnight")
            if today.day == 1:
                self._copy_slot("today", "monthly")
                if today.month in {1, 4, 7, 10}:
                    self._copy_slot("today", "quarterly")

            self.env["majal.admin.audit"].sudo()._log(
                "backup_created",
                _("Verified recovery point created (%s).") % snapshot.size_display,
                snapshot=snapshot,
            )
            return snapshot
        except Exception as error:
            _logger.exception("Majal recovery point creation failed")
            failure = self.sudo().search([("slot", "=", "today")], limit=1)
            if failure:
                failure.sudo().write(
                    {
                        "state": "error",
                        "error_message": str(error)[:2000],
                    }
                )
            raise
        finally:
            self.env.cr.execute(
                "SELECT pg_advisory_unlock(hashtext('majal_verified_backup'))"
            )

    @api.model
    def _cron_create_recovery_points(self):
        self.sudo().create_recovery_point()

    def action_verify(self):
        self.ensure_one()
        path = self._archive_path(self.slot)
        if not os.path.isfile(path):
            self.sudo().write(
                {"state": "error", "error_message": _("Archive file is missing.")}
            )
            raise UserError(_("The recovery archive file is missing."))
        actual = self._hash_file(path)
        with zipfile.ZipFile(path, "r") as archive:
            bad_member = archive.testzip()
            required_missing = {"dump.sql", "manifest.json"} - set(archive.namelist())
        if actual != self.checksum or bad_member or required_missing:
            self.sudo().write(
                {
                    "state": "error",
                    "error_message": _("Checksum or archive integrity validation failed."),
                }
            )
            raise UserError(_("This recovery point failed verification."))
        self.sudo().write(
            {
                "state": "verified",
                "verified_at": fields.Datetime.now(),
                "error_message": False,
            }
        )
        self.env["majal.admin.audit"].sudo()._log(
            "backup_verified",
            _("Recovery point %s was verified.") % self.display_name,
            snapshot=self,
        )
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Recovery point verified"),
                "message": _("Database, manifest and file archive passed integrity checks."),
                "type": "success",
                "sticky": False,
            },
        }

    @api.model
    def action_create_now(self, *_args):
        snapshot = self.create_recovery_point()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Recovery point ready"),
                "message": _("%s was created and verified.") % snapshot.slot_label,
                "type": "success",
                "sticky": False,
                "next": {
                    "type": "ir.actions.client",
                    "tag": "reload",
                },
            },
        }

    def action_download(self):
        self.ensure_one()
        if not self.env.user.has_group(
            "majal_administration.group_platform_owner"
        ):
            raise AccessError(_("Only a Platform Owner can export a recovery archive."))
        if self.state != "verified":
            raise UserError(_("Verify this recovery point before downloading it."))
        return {
            "type": "ir.actions.act_url",
            "url": "/majal/administration/backups/%s/download" % self.id,
            "target": "self",
        }

    def action_prepare_restore(self):
        self.ensure_one()
        if self.state != "verified":
            raise UserError(_("Only a verified recovery point can be restored."))
        return {
            "type": "ir.actions.act_window",
            "name": _("Prepare Protected Restore"),
            "res_model": "majal.restore.request.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_snapshot_id": self.id},
        }


class MajalRestoreRequest(models.Model):
    _name = "majal.restore.request"
    _description = "Majal Protected Restore Request"
    _order = "create_date desc"

    name = fields.Char(required=True, readonly=True)
    snapshot_id = fields.Many2one(
        "majal.backup.snapshot", required=True, readonly=True, ondelete="restrict"
    )
    state = fields.Selection(
        [
            ("prepared", "Prepared"),
            ("expired", "Expired"),
            ("cancelled", "Cancelled"),
            ("completed", "Completed"),
        ],
        default="prepared",
        required=True,
        readonly=True,
    )
    token_hash = fields.Char(required=True, readonly=True)
    expires_at = fields.Datetime(required=True, readonly=True)
    requested_by_id = fields.Many2one(
        "res.users", required=True, readonly=True, default=lambda self: self.env.user
    )
    completed_at = fields.Datetime(readonly=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        readonly=True,
        default=lambda self: self.env.company,
    )

    def action_cancel(self):
        for request in self:
            if request.state == "prepared":
                request.write({"state": "cancelled"})
                request.env["majal.admin.audit"].sudo()._log(
                    "restore_cancelled",
                    _("Protected restore request %s was cancelled.") % request.name,
                    snapshot=request.snapshot_id,
                )
        return {"type": "ir.actions.client", "tag": "reload"}

    @api.model
    def expire_old_requests(self):
        expired = self.search(
            [
                ("state", "=", "prepared"),
                ("expires_at", "<", fields.Datetime.now()),
            ]
        )
        expired.write({"state": "expired"})
