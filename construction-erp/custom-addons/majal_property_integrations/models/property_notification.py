from markupsafe import Markup, escape

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class MajalPropertyNotificationSettings(models.Model):
    _name = "majal.property.notification.settings"
    _description = "Property Reminder Settings"
    _rec_name = "company_id"

    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="cascade", index=True)
    active = fields.Boolean(default=True)
    email_enabled = fields.Boolean(
        default=False,
        help="Creates messages in the native outgoing-mail queue. Delivery still "
             "depends on a separately tested mail server.")
    installment_days = fields.Integer(default=7, required=True)
    lease_days = fields.Integer(default=60, required=True)
    reservation_days = fields.Integer(default=3, required=True)
    document_days = fields.Integer(default=30, required=True)

    _sql_constraints = [
        ("company_unique", "unique(company_id)",
         "Each company can have one Property reminder policy."),
        ("valid_windows", "CHECK(installment_days BETWEEN 0 AND 365 AND "
         "lease_days BETWEEN 0 AND 365 AND reservation_days BETWEEN 0 AND 365 "
         "AND document_days BETWEEN 0 AND 365)",
         "Reminder windows must be between 0 and 365 days."),
    ]


class MajalPropertyNotification(models.Model):
    _name = "majal.property.notification"
    _description = "Property Reminder"
    _order = "due_date, id desc"

    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company,
        ondelete="cascade", index=True)
    kind = fields.Selection(
        [
            ("installment", "Payment Installment"),
            ("lease", "Lease Expiry"),
            ("reservation", "Reservation Expiry"),
            ("document", "Document Expiry"),
        ], required=True, index=True)
    res_model = fields.Char(required=True, index=True)
    res_id = fields.Integer(required=True, index=True)
    partner_id = fields.Many2one("res.partner", ondelete="set null", index=True)
    email_to = fields.Char(readonly=True)
    due_date = fields.Date(required=True, index=True)
    subject = fields.Char(required=True)
    body_html = fields.Html(required=True, sanitize=True)
    idempotency_key = fields.Char(required=True, index=True, copy=False)
    state = fields.Selection(
        [
            ("ready", "Ready"),
            ("queued", "Email Queued"),
            ("sent", "Sent"),
            ("skipped", "No Email"),
            ("cancelled", "Cancelled"),
        ], required=True, default="ready", index=True, copy=False)
    mail_id = fields.Many2one("mail.mail", readonly=True, copy=False, ondelete="set null")

    _sql_constraints = [
        ("company_idempotency_unique", "unique(company_id, idempotency_key)",
         "This reminder has already been created."),
        ("positive_res_id", "CHECK(res_id > 0)", "The linked record ID must be positive."),
    ]

    @api.constrains("res_model", "res_id")
    def _check_reference(self):
        for reminder in self:
            if reminder.res_model not in self.env or not self.env[reminder.res_model].browse(reminder.res_id).exists():
                raise ValidationError(self.env._("The reminder must link to an existing record."))

    @api.model
    def _ensure_reminder(self, *, company, kind, record, partner, due_date, subject):
        key = f"{kind}:{record._name}:{record.id}:{fields.Date.to_string(due_date)}"
        existing = self.search([
            ("company_id", "=", company.id),
            ("idempotency_key", "=", key),
        ], limit=1)
        if existing:
            return existing
        if "company_id" in record._fields and record.company_id != company:
            raise ValidationError(self.env._("The reminder and linked record must use the same company."))
        body = Markup("<p>%s</p><p><strong>%s</strong> %s</p>") % (
            escape(subject),
            escape(self.env._("Due date:")),
            escape(fields.Date.to_string(due_date)),
        )
        return self.create({
            "company_id": company.id,
            "kind": kind,
            "res_model": record._name,
            "res_id": record.id,
            "partner_id": partner.id if partner else False,
            "email_to": partner.email if partner and partner.email else False,
            "due_date": due_date,
            "subject": subject,
            "body_html": body,
            "idempotency_key": key,
        })

    def action_queue_email(self):
        for reminder in self:
            if reminder.state in ("queued", "sent", "cancelled"):
                continue
            if not reminder.email_to:
                reminder.state = "skipped"
                continue
            mail = self.env["mail.mail"].create({
                "email_to": reminder.email_to,
                "subject": reminder.subject,
                "body_html": reminder.body_html,
                "auto_delete": True,
            })
            reminder.write({"mail_id": mail.id, "state": "queued"})
        return True

    def action_open_record(self):
        self.ensure_one()
        record = self.env[self.res_model].browse(self.res_id).exists()
        if not record:
            raise UserError(self.env._("The linked record no longer exists."))
        return {
            "type": "ir.actions.act_window",
            "res_model": self.res_model,
            "res_id": self.res_id,
            "view_mode": "form",
        }

    def action_cancel(self):
        self.filtered(lambda reminder: reminder.state != "sent").write({"state": "cancelled"})
        return True

    @api.model
    def _cron_generate_reminders(self):
        today = fields.Date.context_today(self)
        for settings in self.env["majal.property.notification.settings"].search([("active", "=", True)]):
            company = settings.company_id
            reminders = self.browse()
            installments = self.env["majal.payment.installment"].search([
                ("company_id", "=", company.id),
                ("state", "!=", "paid"),
                ("due_date", "<=", fields.Date.add(today, days=settings.installment_days)),
            ])
            for installment in installments:
                reminders |= self._ensure_reminder(
                    company=company, kind="installment", record=installment,
                    partner=installment.partner_id, due_date=installment.due_date,
                    subject=self.env._("Payment due: %(name)s", name=installment.name))

            leases = self.env["majal.lease"].search([
                ("company_id", "=", company.id),
                ("state", "=", "active"),
                ("end_date", "<=", fields.Date.add(today, days=settings.lease_days)),
            ])
            for lease in leases:
                reminders |= self._ensure_reminder(
                    company=company, kind="lease", record=lease,
                    partner=lease.tenant_id, due_date=lease.end_date,
                    subject=self.env._("Lease renewal due: %(name)s", name=lease.display_name))

            reservations = self.env["majal.reservation"].search([
                ("company_id", "=", company.id),
                ("state", "=", "confirmed"),
                ("expiry_date", "<=", fields.Date.add(today, days=settings.reservation_days)),
            ])
            for reservation in reservations:
                reminders |= self._ensure_reminder(
                    company=company, kind="reservation", record=reservation,
                    partner=reservation.partner_id, due_date=reservation.expiry_date,
                    subject=self.env._("Reservation expires: %(name)s", name=reservation.display_name))

            documents = self.env["majal.property.document"].search([
                ("company_id", "=", company.id),
                ("expiry_date", "!=", False),
                ("expiry_date", "<=", fields.Date.add(today, days=settings.document_days)),
            ])
            for document in documents:
                reminders |= self._ensure_reminder(
                    company=company, kind="document", record=document,
                    partner=document.partner_id, due_date=document.expiry_date,
                    subject=self.env._("Document expires: %(name)s", name=document.name))

            if settings.email_enabled:
                reminders.filtered(lambda reminder: reminder.state == "ready").action_queue_email()
        return True
