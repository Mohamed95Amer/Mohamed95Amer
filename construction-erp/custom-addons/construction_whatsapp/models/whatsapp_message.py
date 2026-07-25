import logging
import re

from odoo import api, fields, models

_logger = logging.getLogger(__name__)

# Meta wants a plain international number: digits only, country code first,
# no plus, no spaces, no separators.
NON_DIGITS = re.compile(r"\D+")

STATES = [
    ("queued", "Queued"),
    ("sent", "Sent"),
    ("delivered", "Delivered"),
    ("read", "Read"),
    ("failed", "Failed"),
    ("cancelled", "Cancelled"),
    ("received", "Received"),
]

# Delivery receipts can arrive out of order, so a state never moves backwards.
PROGRESS = {"queued": 0, "sent": 1, "delivered": 2, "read": 3}


class WhatsappMessage(models.Model):
    """One WhatsApp message, out or in.

    Messages are queued rather than sent inline. A site engineer changing the
    ball-in-court on an RFI should not have their save block on Meta's API, and
    should certainly not have it fail because Meta is slow — the notification
    is a consequence of the change, not part of it.
    """

    _name = "whatsapp.message"
    _description = "WhatsApp Message"
    _order = "create_date desc, id desc"

    account_id = fields.Many2one("whatsapp.account", ondelete="restrict")
    template_id = fields.Many2one("whatsapp.template", ondelete="restrict")
    partner_id = fields.Many2one("res.partner", string="Recipient")
    phone = fields.Char(required=True)
    direction = fields.Selection(
        [("out", "Outgoing"), ("in", "Incoming")], default="out", required=True)
    body = fields.Text()
    state = fields.Selection(STATES, default="queued", required=True, index=True)
    error = fields.Char(readonly=True)
    wa_message_id = fields.Char(string="WhatsApp ID", readonly=True, index=True)

    res_model = fields.Char(string="Document Model", index=True)
    res_id = fields.Integer(string="Document ID", index=True)
    record_name = fields.Char(readonly=True)

    sent_on = fields.Datetime(readonly=True)
    attempts = fields.Integer(readonly=True, default=0)

    # ------------------------------------------------------------------
    # Queueing
    # ------------------------------------------------------------------
    @api.model
    def _normalise_phone(self, number):
        digits = NON_DIGITS.sub("", number or "")
        return digits.lstrip("0") if digits.startswith("00") else digits

    @api.model
    def _partner_phone(self, partner):
        return self._normalise_phone(partner.mobile or partner.phone or "")

    @api.model
    def _queue(self, template, record=None, partner=None, phone=None,
               account=None):
        """Queue one templated message. Returns the message, or an empty set.

        Returning empty rather than raising is deliberate. These calls sit
        inside business operations — approving a permit, reassigning a defect —
        and a subcontractor with no mobile number on file must not be able to
        block that work. The reason is logged instead.
        """
        if isinstance(template, str):
            template = self.env.ref(template, raise_if_not_found=False)
        if not template:
            return self.browse()

        phone = self._normalise_phone(phone) if phone else (
            self._partner_phone(partner) if partner else "")
        if not phone:
            _logger.info(
                "WhatsApp: no number for %s, skipping template %s",
                partner.display_name if partner else "recipient",
                template.template_name,
            )
            return self.browse()

        company = record.company_id if record and "company_id" in record._fields else None
        account = account or self.env["whatsapp.account"]._default_account(company)
        values = {
            "account_id": account.id if account else False,
            "template_id": template.id,
            "partner_id": partner.id if partner else False,
            "phone": phone,
            "direction": "out",
        }
        if record:
            values.update({
                "res_model": record._name,
                "res_id": record.id,
                "record_name": record.display_name,
            })
            values["body"] = template._plain_body(record)
        else:
            values["body"] = template._plain_body(None)
        return self.create(values)

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------
    def _record(self):
        self.ensure_one()
        if not self.res_model or not self.res_id:
            return None
        model = self.env.get(self.res_model)
        if model is None:
            return None
        record = model.browse(self.res_id).exists()
        return record or None

    def _dispatch(self):
        """Send one queued message. Never raises — failures are recorded."""
        self.ensure_one()
        if self.state != "queued":
            return False
        if not self.account_id:
            # Nothing is configured yet. The message stays queued so that
            # connecting an account later sends the backlog rather than
            # discarding alerts nobody knew were being dropped.
            return False
        payload = self.template_id._payload(self._record(), self.phone)
        self.attempts += 1
        try:
            response = self.account_id._perform_request(
                f"{self.account_id.phone_number_id}/messages", payload)
        except Exception as err:
            self.write({"state": "failed", "error": str(err)[:500]})
            _logger.warning("WhatsApp send failed for %s: %s", self.phone, err)
            return False
        wa_id = ""
        try:
            wa_id = response["messages"][0]["id"]
        except (KeyError, IndexError, TypeError):
            pass
        self.write({
            "state": "sent",
            "wa_message_id": wa_id,
            "sent_on": fields.Datetime.now(),
            "error": False,
        })
        self._log_to_record()
        return True

    def _log_to_record(self):
        """Leave a trace on the document the alert was about."""
        self.ensure_one()
        record = self._record()
        if record is None or not hasattr(record, "message_post"):
            return
        record.message_post(body=self.env._(
            "WhatsApp sent to %(name)s (%(phone)s): %(body)s",
            name=self.partner_id.display_name or self.env._("recipient"),
            phone=self.phone, body=self.body or "",
        ))

    def action_retry(self):
        self.filtered(lambda m: m.state == "failed").write(
            {"state": "queued", "error": False})

    def action_cancel(self):
        self.filtered(lambda m: m.state == "queued").write({"state": "cancelled"})

    @api.model
    def _cron_dispatch(self, limit=100):
        queued = self.search(
            [("state", "=", "queued"), ("account_id", "!=", False)], limit=limit)
        for message in queued:
            message._dispatch()
        return len(queued)

    # ------------------------------------------------------------------
    # Delivery receipts
    # ------------------------------------------------------------------
    @api.model
    def _apply_status(self, wa_message_id, status):
        """Move a message forward on a delivery receipt.

        Receipts are not ordered — 'read' can arrive before 'delivered' — so
        the state only ever advances. Otherwise a late receipt would make a
        message that was read look merely delivered.
        """
        message = self.search([("wa_message_id", "=", wa_message_id)], limit=1)
        if not message:
            return self.browse()
        if status == "failed":
            message.state = "failed"
            return message
        if status in PROGRESS and PROGRESS[status] > PROGRESS.get(message.state, -1):
            message.state = status
        return message

    # ------------------------------------------------------------------
    # Inbound
    # ------------------------------------------------------------------
    @api.model
    def _handle_webhook(self, payload):
        """Process one Meta callback: delivery receipts and inbound replies."""
        touched = self.browse()
        for entry in payload.get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                for status in value.get("statuses") or []:
                    touched |= self._apply_status(
                        status.get("id"), status.get("status"))
                for message in value.get("messages") or []:
                    touched |= self._record_inbound(value, message)
        return touched

    @api.model
    def _record_inbound(self, value, message):
        """Log a reply and put it on the record the conversation was about.

        A reply within 24 hours is free and is the only way a site team can
        answer without logging in, so it is worth landing somewhere useful
        rather than in a log nobody reads. The thread is found from the last
        message sent to that number.
        """
        phone = self._normalise_phone(message.get("from"))
        text = (message.get("text") or {}).get("body") or ""
        previous = self.search(
            [("phone", "=", phone), ("direction", "=", "out"),
             ("res_model", "!=", False)],
            order="create_date desc", limit=1,
        )
        account = self.env["whatsapp.account"].search(
            [("phone_number_id", "=", (value.get("metadata") or {}).get(
                "phone_number_id"))], limit=1)
        inbound = self.create({
            "account_id": account.id if account else previous.account_id.id,
            "partner_id": previous.partner_id.id,
            "phone": phone,
            "direction": "in",
            "state": "received",
            "body": text,
            "wa_message_id": message.get("id"),
            "res_model": previous.res_model,
            "res_id": previous.res_id,
            "record_name": previous.record_name,
        })
        record = inbound._record()
        if record is not None and hasattr(record, "message_post"):
            record.message_post(body=self.env._(
                "WhatsApp reply from %(name)s (%(phone)s): %(text)s",
                name=inbound.partner_id.display_name or self.env._("unknown"),
                phone=phone, text=text or self.env._("(no text)"),
            ))
        return inbound
