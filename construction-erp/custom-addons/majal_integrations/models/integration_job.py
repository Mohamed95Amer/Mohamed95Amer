from datetime import timedelta

from psycopg2 import IntegrityError, errorcodes

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class MajalIntegrationJob(models.Model):
    """An auditable, retryable and idempotent outbound unit of work."""

    _name = "majal.integration.job"
    _description = "Majal Integration Job"
    _order = "create_date desc, id desc"

    provider_id = fields.Many2one(
        "majal.integration.provider", required=True, ondelete="restrict", index=True)
    company_id = fields.Many2one(
        related="provider_id.company_id", store=True, readonly=True, index=True)
    idempotency_key = fields.Char(required=True, index=True, copy=False)
    operation = fields.Char(required=True, index=True)
    payload = fields.Json(
        required=True, default=dict, copy=False,
        help="Only the minimum provider-neutral payload. Never put credentials here.")
    res_model = fields.Char(index=True)
    res_id = fields.Integer(index=True)
    state = fields.Selection(
        [
            ("pending", "Pending"),
            ("processing", "Processing"),
            ("retry", "Waiting to Retry"),
            ("succeeded", "Succeeded"),
            ("failed", "Failed"),
            ("cancelled", "Cancelled"),
        ],
        default="pending", required=True, readonly=True, index=True, copy=False)
    attempt_count = fields.Integer(default=0, readonly=True, copy=False)
    next_attempt_at = fields.Datetime(index=True, copy=False)
    started_at = fields.Datetime(readonly=True, copy=False)
    completed_at = fields.Datetime(readonly=True, copy=False)
    external_id = fields.Char(readonly=True, copy=False, index=True)
    response_summary = fields.Char(readonly=True, copy=False)
    error = fields.Text(readonly=True, copy=False)

    _sql_constraints = [
        ("provider_idempotency_unique", "unique(provider_id, idempotency_key)",
         "This provider operation has already been queued."),
        ("positive_res_id", "CHECK(res_id IS NULL OR res_id > 0)",
         "The linked record ID must be positive."),
    ]

    @api.constrains("res_model", "res_id")
    def _check_record_reference(self):
        for job in self:
            if bool(job.res_model) != bool(job.res_id):
                raise ValidationError(
                    self.env._("A linked model and record ID must be supplied together."))

    @api.model
    def _enqueue(self, provider, idempotency_key, operation, payload=None, record=None):
        provider.ensure_one()
        existing = self.search([
            ("provider_id", "=", provider.id),
            ("idempotency_key", "=", idempotency_key),
        ], limit=1)
        if existing:
            return existing
        values = {
            "provider_id": provider.id,
            "idempotency_key": idempotency_key,
            "operation": operation,
            "payload": payload or {},
        }
        if record:
            record.ensure_one()
            if "company_id" in record._fields and record.company_id != provider.company_id:
                raise ValidationError(
                    self.env._("The provider and linked record must belong to the same company."))
            values.update({"res_model": record._name, "res_id": record.id})
        try:
            with self.env.cr.savepoint():
                return self.create(values)
        except IntegrityError as exc:
            if (exc.pgcode != errorcodes.UNIQUE_VIOLATION
                    or exc.diag.constraint_name != "majal_integration_job_provider_idempotency_unique"):
                raise
            # Another worker won the same enqueue race. Returning that row
            # preserves the idempotent contract without hiding other SQL errors.
            return self.search([
                ("provider_id", "=", provider.id),
                ("idempotency_key", "=", idempotency_key),
            ], limit=1)

    def _run_one(self):
        self.ensure_one()
        if self.state not in ("pending", "retry"):
            return False
        if self.provider_id.state != "active":
            raise UserError(self.env._("The integration provider is not active."))
        self.write({
            "state": "processing",
            "attempt_count": self.attempt_count + 1,
            "started_at": fields.Datetime.now(),
            "error": False,
        })
        result = self.provider_id._deliver_job(self) or {}
        if not isinstance(result, dict):
            raise ValidationError(self.env._("An integration adapter returned an invalid result."))
        self.write({
            "state": "succeeded",
            "completed_at": fields.Datetime.now(),
            "next_attempt_at": False,
            "external_id": result.get("external_id"),
            "response_summary": (result.get("summary") or self.env._("Completed"))[:255],
        })
        self.provider_id.write({
            "last_success_at": fields.Datetime.now(),
            "last_error": False,
        })
        return True

    def _record_failure(self, error):
        self.ensure_one()
        attempts = self.attempt_count + (0 if self.state == "processing" else 1)
        maximum = self.provider_id.max_attempts
        terminal = attempts >= maximum
        delay_minutes = min(60, 2 ** max(attempts - 1, 0))
        message = str(error)[:4000]
        self.write({
            "state": "failed" if terminal else "retry",
            "attempt_count": attempts,
            "next_attempt_at": False if terminal else fields.Datetime.now() + timedelta(minutes=delay_minutes),
            "error": message,
        })
        self.provider_id.write({"last_error": message})

    @api.model
    def _process_batch(self, limit=50):
        limit = max(1, min(int(limit), 1000))
        now = fields.Datetime.now()
        # A normal ORM search does not claim rows. Two cron workers could then
        # deliver the same job at the same time. Row locks with SKIP LOCKED make
        # each job belong to one worker for this transaction.
        self.env.cr.execute(
            """
                SELECT job.id
                  FROM majal_integration_job AS job
                  JOIN majal_integration_provider AS provider
                    ON provider.id = job.provider_id
                 WHERE job.state IN ('pending', 'retry')
                   AND provider.state = 'active'
                   AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= %s)
                 ORDER BY job.create_date, job.id
                 FOR UPDATE OF job SKIP LOCKED
                 LIMIT %s
            """,
            (now, limit),
        )
        jobs = self.browse([row[0] for row in self.env.cr.fetchall()])
        processed = 0
        for job in jobs:
            try:
                with self.env.cr.savepoint():
                    job._run_one()
                processed += 1
            except Exception as exc:  # adapters are an external trust boundary
                job._record_failure(exc)
        return processed

    def action_retry(self):
        retryable = self.filtered(lambda job: job.state in ("failed", "retry"))
        retryable.write({"state": "pending", "next_attempt_at": False, "error": False})
        return True

    def action_cancel(self):
        invalid = self.filtered(lambda job: job.state in ("processing", "succeeded"))
        if invalid:
            raise UserError(self.env._("Processing or completed jobs cannot be cancelled."))
        self.write({"state": "cancelled", "next_attempt_at": False})
        return True

    @api.model
    def _cron_process_jobs(self):
        self._process_batch()
        return True
