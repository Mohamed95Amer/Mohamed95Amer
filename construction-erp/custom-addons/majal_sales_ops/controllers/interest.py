"""The two places interest arrives from outside Odoo.

A click in an email, and the contact form on majalops.com. Both are public
routes, because the people using them are not logged in and never will be, so
each one states plainly what it will accept.

The form endpoint in particular writes to the database on an unauthenticated
POST. That is an open door unless something guards it, so it carries a shared
secret compared with hmac.compare_digest — the same treatment the WhatsApp
webhook in this suite gives Meta's callback, and for the same reason: a plain
equality check on a secret leaks its length and prefix through timing.
"""

import hmac
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

INBOUND_SECRET_PARAM = "majal_sales_ops.inbound_secret"

# What the website's reason field means to the pipeline. "demo" is the
# strongest signal on the site and is scored as such; everything else is a
# contact form submission.
REASON_KIND = {
    "demo": "demo_request",
    "general": "form_submit",
    "self-host": "form_submit",
    "other": "form_submit",
}


class MajalInterest(http.Controller):

    @http.route("/majal/c/<string:token>/<int:index>", type="http",
                auth="public", methods=["GET"], csrf=False, save_session=False)
    def click(self, token, index, **kwargs):
        """Record a click and send the reader where they were going.

        The destination comes from this message's stored links, looked up by
        position — it is never read from the request. An unknown token or
        index redirects to the site rather than erroring: the reader clicked a
        link in good faith and should land somewhere useful even if the record
        behind it was deleted.
        """
        base = request.env["ir.config_parameter"].sudo().get_param(
            "web.base.url") or "https://majalops.com"
        link = request.env["majal.outreach.link"].sudo().search([
            ("outreach_id.access_token", "=", token),
            ("index", "=", index),
        ], limit=1)
        if not link:
            _logger.info("Majal click with no matching link: %s/%s", token, index)
            return request.redirect("https://majalops.com", local=False)
        try:
            destination = link._register_click()
        except Exception:  # noqa: BLE001 - never fail a reader's click
            _logger.exception("Could not record Majal click %s/%s", token, index)
            destination = link.url
        return request.redirect(destination, local=False)

    @http.route("/majal/inbound/website", type="json", auth="public",
                methods=["POST"], csrf=False, save_session=False)
    def website_form(self, **payload):
        """Accept a contact-form submission from majalops.com.

        Previously this went to a mailbox through Resend and stopped there, so
        the warmest people in the funnel — the ones who found the form and
        asked for a demo — never entered the pipeline at all and depended on
        somebody noticing an email.

        The site still sends its email. This is additional, and deliberately
        forgiving: a submission that cannot be turned into a lead is logged
        loudly rather than raising, because the alternative is a 500 on the
        contact form of a site that is trying to make a first impression.
        """
        secret = request.env["ir.config_parameter"].sudo().get_param(
            INBOUND_SECRET_PARAM)
        supplied = payload.get("secret") or ""
        if not secret or not hmac.compare_digest(str(supplied), str(secret)):
            _logger.warning("Majal inbound form rejected: bad or missing secret")
            return {"ok": False, "error": "forbidden"}

        try:
            lead = self._lead_from_submission(payload)
        except Exception:  # noqa: BLE001 - the visitor must not see a 500
            _logger.exception("Majal inbound form could not create a lead")
            return {"ok": False, "error": "internal"}
        return {"ok": True, "lead_id": lead.id}

    def _lead_from_submission(self, payload):
        """Turn a form submission into a lead, or attach it to the known one.

        A prospect already in the pipeline who fills the form is not a new
        lead — they are an existing one who just became much more interesting.
        Creating a duplicate would split their history in half and leave the
        sequence still running at them.
        """
        env = request.env
        Lead = env["crm.lead"].sudo()
        email = (payload.get("email") or "").strip().lower()
        company = (payload.get("company") or "").strip()
        name = (payload.get("name") or "").strip()
        reason = (payload.get("reason") or "other").strip()
        message = (payload.get("message") or "").strip()

        from ..models import normalise
        domain_key = normalise.email_domain(email)
        existing = Lead.search([
            ("majal_managed", "=", True),
            ("majal_dedup_key", "=", "domain:%s" % domain_key),
        ], limit=1) if domain_key else Lead.browse()
        if not existing and email:
            existing = Lead.search([
                ("majal_managed", "=", True), ("email_from", "=ilike", email),
            ], limit=1)

        if existing:
            lead = existing
            lead.message_post(
                body=env._("Contact form on majalops.com — %(reason)s\n\n%(message)s",
                           reason=reason, message=message or "(no message)"))
        else:
            source = env.ref("majal_sales_ops.source_inbound_website")
            lead = Lead.create({
                "name": company or name or email or "Website enquiry",
                "partner_name": company or False,
                "contact_name": name or False,
                "email_from": email or False,
                "description": message or False,
                "majal_managed": True,
                "majal_source_id": source.id,
                # Somebody who came to us is not on a cold sequence. They get a
                # person, not step one of a five-touch follow-up.
                "majal_sequence_state": "paused",
            })

        env["majal.interest.event"].record(
            lead, REASON_KIND.get(reason, "form_submit"),
            detail="majalops.com — %s" % reason)
        return lead
