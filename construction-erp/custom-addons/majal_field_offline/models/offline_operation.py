import base64
import binascii

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError


ALLOWED_KINDS = [
    ("defect.create", "Create Draft Defect"),
    ("defect.progress", "Update Assigned Defect"),
    ("inspection.answer", "Answer Assigned Inspection"),
    ("workorder.checklist", "Update Work Order Checklist"),
    ("workorder.note", "Update Work Order Note"),
    ("daily_log.create", "Create Daily Log Draft"),
    ("asset.scan", "Record Asset Scan"),
]


class OfflineConflict(UserError):
    pass


class MajalOfflineOperation(models.Model):
    _name = "majal.offline.operation"
    _description = "Majal Offline Sync Operation"
    _order = "create_date desc"

    client_uuid = fields.Char(required=True, readonly=True, index=True)
    user_id = fields.Many2one(
        "res.users",
        required=True,
        readonly=True,
        default=lambda self: self.env.user,
        index=True,
    )
    company_id = fields.Many2one(
        "res.company",
        required=True,
        readonly=True,
        default=lambda self: self.env.company,
        index=True,
    )
    kind = fields.Selection(ALLOWED_KINDS, required=True, readonly=True)
    target_model = fields.Char(readonly=True)
    target_id = fields.Integer(readonly=True)
    base_write_date = fields.Datetime(readonly=True)
    payload = fields.Json(required=True, readonly=True)
    state = fields.Selection(
        [
            ("received", "Received"),
            ("applied", "Applied"),
            ("conflict", "Conflict"),
            ("failed", "Failed"),
        ],
        default="received",
        required=True,
        readonly=True,
        index=True,
    )
    result = fields.Json(readonly=True)
    processed_at = fields.Datetime(readonly=True)

    _sql_constraints = [
        (
            "majal_offline_uuid_user_unique",
            "unique(client_uuid, user_id)",
            "This offline operation has already been received.",
        )
    ]

    @api.model
    def _validate_uuid(self, value):
        if not isinstance(value, str) or len(value) < 16 or len(value) > 80:
            raise ValidationError(_("Invalid offline operation identifier."))
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        if set(value) - allowed:
            raise ValidationError(_("Invalid offline operation identifier."))

    @api.model
    def _assert_assigned(self, record, user_field="user_id"):
        self_user = self.env.user
        role_rank = self_user.majal_role_id.rank or 0
        assigned = record[user_field] if user_field in record._fields else False
        if role_rank < 30 and assigned != self_user:
            raise AccessError(_("This record is not assigned to you."))

    @api.model
    def _assert_not_stale(self, record, base_write_date):
        if not base_write_date:
            return
        client_value = fields.Datetime.to_datetime(base_write_date).replace(microsecond=0)
        server_value = fields.Datetime.to_datetime(record.write_date).replace(microsecond=0)
        if client_value != server_value:
            raise OfflineConflict(
                _("The server record changed after it was saved for offline work.")
            )

    @api.model
    def _decode_photo(self, value):
        if not value:
            return False
        if not isinstance(value, str) or len(value) > 8 * 1024 * 1024:
            raise ValidationError(_("Offline photos must be smaller than 6 MB."))
        if "," in value and value.startswith("data:"):
            value = value.split(",", 1)[1]
        try:
            base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error):
            raise ValidationError(_("The offline photo is invalid.")) from None
        return value

    @api.model
    def _apply_defect_create(self, payload, _base_write_date):
        allowed = {
            "project_id": int(payload["project_id"]),
            "name": str(payload.get("name") or "").strip(),
            "description": str(payload.get("description") or "").strip(),
            "location": str(payload.get("location") or "").strip(),
            "severity": payload.get("severity", "medium"),
            "assigned_user_id": self.env.user.id,
        }
        if not allowed["name"]:
            raise ValidationError(_("A defect title is required."))
        if allowed["severity"] not in {"low", "medium", "high", "critical"}:
            raise ValidationError(_("Invalid defect severity."))
        photo = self._decode_photo(payload.get("photo_before"))
        if photo:
            allowed["photo_before"] = photo
        record = self.env["construction.defect"].create(allowed)
        return record, {"record_id": record.id, "reference": record.reference}

    @api.model
    def _apply_defect_progress(self, payload, base_write_date):
        record = self.env["construction.defect"].browse(int(payload["record_id"])).exists()
        if not record:
            raise ValidationError(_("The assigned defect no longer exists."))
        self._assert_assigned(record, "assigned_user_id")
        self._assert_not_stale(record, base_write_date)
        action = payload.get("action")
        if action == "start":
            record.action_start()
        elif action == "ready":
            record.action_ready()
        else:
            raise ValidationError(_("Offline defects may only be started or marked ready."))
        return record, {"record_id": record.id, "state": record.state}

    @api.model
    def _apply_inspection_answer(self, payload, base_write_date):
        answer = self.env["construction.form.answer"].browse(
            int(payload["answer_id"])
        ).exists()
        if not answer:
            raise ValidationError(_("The inspection answer no longer exists."))
        inspection = answer.inspection_id
        self._assert_assigned(inspection, "inspector_id")
        self._assert_not_stale(inspection, base_write_date)
        if inspection.state not in ("draft", "in_progress", "rejected"):
            raise UserError(_("This inspection is no longer editable."))
        field_name = {
            "yes_no": "answer_yes_no",
            "text": "answer_text",
            "number": "answer_number",
            "date": "answer_date",
        }.get(answer.answer_type)
        if not field_name:
            raise ValidationError(_("Photo and signature answers must be completed online."))
        value = payload.get("value")
        if field_name == "answer_yes_no" and value not in {"yes", "no", "na"}:
            raise ValidationError(_("Invalid inspection answer."))
        answer.write({field_name: value, "comment": str(payload.get("comment") or "")})
        return answer, {"record_id": inspection.id, "answer_id": answer.id}

    @api.model
    def _apply_workorder_checklist(self, payload, base_write_date):
        task = self.env["facility.request.task"].browse(int(payload["task_id"])).exists()
        if not task:
            raise ValidationError(_("The checklist item no longer exists."))
        request_record = task.request_id
        self._assert_assigned(request_record, "user_id")
        self._assert_not_stale(request_record, base_write_date)
        task.write({"done": bool(payload.get("done"))})
        return task, {
            "record_id": request_record.id,
            "task_id": task.id,
            "done": task.done,
        }

    @api.model
    def _apply_workorder_note(self, payload, base_write_date):
        record = self.env["maintenance.request"].browse(
            int(payload["record_id"])
        ).exists()
        if not record:
            raise ValidationError(_("The work order no longer exists."))
        self._assert_assigned(record, "user_id")
        self._assert_not_stale(record, base_write_date)
        values = {"description": str(payload.get("description") or "")}
        if "labor_hours" in payload:
            hours = float(payload["labor_hours"])
            if hours < 0 or hours > 24:
                raise ValidationError(_("Daily labor hours must be between 0 and 24."))
            values["labor_hours"] = hours
        record.write(values)
        return record, {"record_id": record.id, "write_date": record.write_date}

    @api.model
    def _apply_daily_log_create(self, payload, _base_write_date):
        values = {
            "project_id": int(payload["project_id"]),
            "log_date": payload.get("log_date") or fields.Date.context_today(self),
            "weather": payload.get("weather", "sunny"),
            "temperature": float(payload.get("temperature") or 0),
            "notes": str(payload.get("notes") or ""),
            "prepared_by_id": self.env.user.id,
        }
        if values["weather"] not in {"sunny", "cloudy", "rain", "storm", "hot", "windy"}:
            raise ValidationError(_("Invalid weather value."))
        record = self.env["construction.daily.log"].create(values)
        return record, {"record_id": record.id, "state": record.state}

    @api.model
    def _apply_asset_scan(self, payload, _base_write_date):
        asset = self.env["maintenance.equipment"].browse(
            int(payload["equipment_id"])
        ).exists()
        if not asset:
            raise ValidationError(_("The asset no longer exists."))
        role_rank = self.env.user.majal_role_id.rank or 0
        if role_rank < 30 and self.env.user not in (
            asset.technician_user_id | asset.owner_user_id
        ):
            raise AccessError(_("This asset is not assigned to you."))
        source = payload.get("source", "manual")
        scan = asset.record_tag_scan(source)
        return scan, {"record_id": scan.id, "equipment_id": asset.id}

    @api.model
    def _apply_payload(self, kind, payload, base_write_date):
        handlers = {
            "defect.create": self._apply_defect_create,
            "defect.progress": self._apply_defect_progress,
            "inspection.answer": self._apply_inspection_answer,
            "workorder.checklist": self._apply_workorder_checklist,
            "workorder.note": self._apply_workorder_note,
            "daily_log.create": self._apply_daily_log_create,
            "asset.scan": self._apply_asset_scan,
        }
        handler = handlers.get(kind)
        if not handler:
            raise ValidationError(_("This operation is not allowed offline."))
        return handler(payload, base_write_date)

    @api.model
    def _sync_batch(self, operations):
        if not isinstance(operations, list) or len(operations) > 100:
            raise ValidationError(_("Sync batches may contain at most 100 operations."))
        results = []
        for raw in operations:
            client_uuid = raw.get("client_uuid")
            self._validate_uuid(client_uuid)
            existing = self.search(
                [
                    ("client_uuid", "=", client_uuid),
                    ("user_id", "=", self.env.user.id),
                ],
                limit=1,
            )
            if existing:
                results.append(
                    {
                        "client_uuid": client_uuid,
                        "status": existing.state,
                        "result": existing.result or {},
                        "duplicate": True,
                    }
                )
                continue
            kind = raw.get("kind")
            if kind not in dict(ALLOWED_KINDS):
                results.append(
                    {
                        "client_uuid": client_uuid,
                        "status": "failed",
                        "error": _("This operation is not allowed offline."),
                    }
                )
                continue
            payload = raw.get("payload")
            if not isinstance(payload, dict):
                payload = {}
            operation = self.create(
                {
                    "client_uuid": client_uuid,
                    "kind": kind,
                    "target_model": raw.get("target_model"),
                    "target_id": int(raw.get("target_id") or 0),
                    "base_write_date": raw.get("base_write_date") or False,
                    "payload": payload,
                }
            )
            try:
                with self.env.cr.savepoint():
                    _target, result = self._apply_payload(
                        kind, payload, raw.get("base_write_date")
                    )
                state = "applied"
                response = result
            except OfflineConflict as error:
                state = "conflict"
                response = {"error": str(error)}
            except (AccessError, UserError, ValidationError) as error:
                state = "failed"
                response = {"error": str(error)}
            operation.sudo().write(
                {
                    "state": state,
                    "result": response,
                    "processed_at": fields.Datetime.now(),
                }
            )
            results.append(
                {
                    "client_uuid": client_uuid,
                    "status": state,
                    "result": response,
                }
            )
        return results
