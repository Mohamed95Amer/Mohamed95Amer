import hmac
import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class WhatsappWebhook(http.Controller):
    """Meta's callback for delivery receipts and inbound replies.

    The route is public because Meta calls it, so the verify token is the only
    thing standing between this endpoint and anyone on the internet writing
    into the message log. It is compared with hmac.compare_digest — a plain
    equality check on a secret leaks its length and prefix through timing.
    """

    @http.route("/whatsapp/webhook", type="http", auth="public",
                methods=["GET"], csrf=False, save_session=False)
    def verify(self, **params):
        """Meta's one-off subscription handshake."""
        mode = params.get("hub.mode")
        token = params.get("hub.verify_token") or ""
        challenge = params.get("hub.challenge") or ""
        accounts = request.env["whatsapp.account"].sudo().search(
            [("webhook_verify_token", "!=", False)])
        expected = accounts.mapped("webhook_verify_token")
        if mode == "subscribe" and any(
                hmac.compare_digest(token, candidate) for candidate in expected):
            return request.make_response(challenge)
        _logger.warning("WhatsApp webhook verification rejected")
        return request.make_response("forbidden", status=403)

    @http.route("/whatsapp/webhook", type="http", auth="public",
                methods=["POST"], csrf=False, save_session=False)
    def receive(self, **kwargs):
        """Accept a signed callback from Meta, and nothing else.

        This endpoint writes to the database — it advances message states and
        posts inbound text into the chatter of whichever record the
        conversation was about. Unauthenticated, that is an open door: anyone
        could mark messages as read or inject text into a project's history.
        So the signature is checked before the body is even parsed.
        """
        body = request.httprequest.get_data() or b""
        signature = request.httprequest.headers.get("X-Hub-Signature-256")
        if not request.env["whatsapp.account"].sudo()._verify_signature(
                signature, body):
            _logger.warning(
                "WhatsApp webhook rejected: signature missing or invalid")
            return request.make_response("forbidden", status=403)
        try:
            payload = json.loads(body or b"{}")
        except ValueError:
            return request.make_response("bad request", status=400)
        try:
            request.env["whatsapp.message"].sudo()._handle_webhook(payload)
        except Exception:
            # Meta retries anything that is not a 200, and a retry storm on a
            # payload we cannot parse helps nobody. The error is logged and the
            # delivery acknowledged.
            _logger.exception("WhatsApp webhook could not be processed")
        return request.make_response("ok")
