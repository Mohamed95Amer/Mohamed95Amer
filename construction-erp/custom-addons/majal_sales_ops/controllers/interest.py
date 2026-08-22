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

        # Match the person, then their employer. Matching the employer first
        # would attach a demo request to whichever colleague happened to be
        # imported earliest, and bury it in someone else's history.
        existing = Lead.search([
            ("majal_managed", "=", True), ("email_from", "=ilike", email),
        ], limit=1) if email else Lead.browse()
        if not existing:
            from ..models import normalise
            domain_key = normalise.email_domain(email)
            if domain_key:
                existing = Lead.search([
                    ("majal_managed", "=", True),
                    ("majal_domain", "=", domain_key),
                    ("contact_name", "=ilike", name or "\u0000"),
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


# Two pages, one route. Kept as plain strings rather than QWeb templates
# because this addon does not depend on `website`, and an unsubscribe page that
# needs a whole extra module installed to render is an unsubscribe page that
# will one day fail to render.
_PAGE = """<!DOCTYPE html>
<html lang="%(lang)s" dir="%(dir)s"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>%(title)s</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;
      background:#f8f6f0;color:#193d52;margin:0;padding:48px 16px}
 .card{max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
       padding:32px;box-shadow:0 1px 3px rgba(25,61,82,.12)}
 h1{font-size:20px;margin:0 0 12px}
 p{line-height:1.6;color:#4a5b66}
 button{background:#397989;color:#fff;border:0;border-radius:8px;
        padding:12px 20px;font-size:15px;cursor:pointer}
</style></head>
<body><div class="card"><h1>%(title)s</h1><p>%(body)s</p>%(form)s</div></body>
</html>"""

# No CSRF field: the route sets csrf=False (a mail client's one-click POST
# carries no Odoo session and could never supply one), so a hidden token here
# would be decoration that is never checked. The random per-message token in
# the URL is what authorises the action, and forging a request still requires
# knowing it.
_FORM = '<form method="post"><button type="submit">%s</button></form>' 

_COPY = {
    "ar": {
        "dir": "rtl", "lang": "ar",
        "confirm_title": "إلغاء الاشتراك",
        "confirm_body": "اضغط الزر أدناه لإيقاف جميع رسائل مجال إلى هذا "
                        "البريد الإلكتروني.",
        "button": "تأكيد إلغاء الاشتراك",
        "done_title": "تم إلغاء الاشتراك",
        "done_body": "لن نرسل لك رسائل أخرى. نعتذر عن الإزعاج.",
        "gone_title": "الرابط غير صالح",
        "gone_body": "لم نتمكن من العثور على هذا الاشتراك. قد يكون قد تم "
                     "إلغاؤه بالفعل.",
    },
    "en": {
        "dir": "ltr", "lang": "en",
        "confirm_title": "Unsubscribe",
        "confirm_body": "Press the button below and Majal will stop emailing "
                        "this address.",
        "button": "Confirm unsubscribe",
        "done_title": "Unsubscribed",
        "done_body": "You will not hear from us again. Sorry for the "
                     "interruption.",
        "gone_title": "Link not recognised",
        "gone_body": "We could not find this subscription. It may already "
                     "have been cancelled.",
    },
}


class MajalUnsubscribe(http.Controller):

    @http.route("/majal/unsubscribe/<string:token>", type="http",
                auth="public", methods=["GET", "POST"], csrf=False,
                save_session=False)
    def unsubscribe(self, token, **kwargs):
        """Show a confirmation on GET; act on POST.

        A GET that unsubscribes would be wrong twice over. Corporate mail
        security scanners fetch every link in an incoming message before the
        recipient sees it, so people would be unsubscribed by their own
        employer's filter — and RFC 9110 reserves GET for reads. The one-click
        header points here as a POST, which is what RFC 8058 specifies, so
        Gmail's and Outlook's native buttons still work in one press.
        """
        outreach = request.env["majal.outreach"].sudo().search(
            [("access_token", "=", token)], limit=1)
        lang = (outreach.lead_id.majal_lang or "ar") if outreach else "ar"
        copy = _COPY.get(lang, _COPY["ar"])

        if not outreach:
            return self._render(copy, copy["gone_title"], copy["gone_body"])

        if request.httprequest.method == "GET":
            form = _FORM % copy["button"]
            return self._render(
                copy, copy["confirm_title"], copy["confirm_body"], form)

        try:
            outreach.lead_id.majal_opt_out(source="unsubscribe-link")
        except Exception:  # noqa: BLE001
            # Still show success. The person did what was asked of them; an
            # error page invites them to conclude it did not work and to press
            # "spam" instead, which costs the domain far more than this row.
            _logger.exception("Majal unsubscribe failed for token %s", token)
        return self._render(copy, copy["done_title"], copy["done_body"])

    def _render(self, copy, title, body, form=""):
        html = _PAGE % {
            "lang": copy["lang"], "dir": copy["dir"],
            "title": title, "body": body, "form": form,
        }
        return request.make_response(html, headers=[
            ("Content-Type", "text/html; charset=utf-8"),
            ("X-Robots-Tag", "noindex"),
        ])
