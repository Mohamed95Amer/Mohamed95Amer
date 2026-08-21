"""The only way these scripts touch Majal.

XML-RPC from the standard library, because the alternative is asking somebody
to keep a Python environment healthy on a Windows machine forever in order for
their sales follow-up to happen.

Credentials come from the environment and never from a file in the repository.
Odoo API keys are the right credential here rather than a password: they can be
revoked one at a time without changing a login, and they do not carry the
session rights a password does.

The agents authenticate as their own Odoo user — not as the founder. That is
not ceremony. The approval engine's "not the author" control only means
anything if the thing that drafts and the person who approves are different
identities, and the audit trail is only worth reading if it can tell a machine's
work from a human's.
"""

import os
import ssl
import xmlrpc.client


class MajalOdoo:
    def __init__(self, url=None, db=None, username=None, api_key=None):
        self.url = (url or os.environ.get("MAJAL_ODOO_URL", "")).rstrip("/")
        self.db = db or os.environ.get("MAJAL_ODOO_DB", "")
        self.username = username or os.environ.get("MAJAL_ODOO_USER", "")
        self.api_key = api_key or os.environ.get("MAJAL_ODOO_KEY", "")
        missing = [
            name for name, value in (
                ("MAJAL_ODOO_URL", self.url), ("MAJAL_ODOO_DB", self.db),
                ("MAJAL_ODOO_USER", self.username),
                ("MAJAL_ODOO_KEY", self.api_key),
            ) if not value
        ]
        if missing:
            raise SystemExit(
                "Missing Odoo settings: %s.\nSet them in the environment — see "
                "sales-agents/README.md." % ", ".join(missing))

        # Only relaxed for an explicitly-declared local demo over plain http;
        # never a way to silence a certificate error on a real host.
        context = None
        if self.url.startswith("https://"):
            context = ssl.create_default_context()

        self._common = xmlrpc.client.ServerProxy(
            "%s/xmlrpc/2/common" % self.url, context=context, allow_none=True)
        self._models = xmlrpc.client.ServerProxy(
            "%s/xmlrpc/2/object" % self.url, context=context, allow_none=True)
        self.uid = self._common.authenticate(
            self.db, self.username, self.api_key, {})
        if not self.uid:
            raise SystemExit(
                "Odoo refused these credentials. Check MAJAL_ODOO_USER and "
                "MAJAL_ODOO_KEY — the key is an Odoo API key, not a password.")

    # ------------------------------------------------------------------
    def call(self, model, method, *args, **kwargs):
        return self._models.execute_kw(
            self.db, self.uid, self.api_key, model, method,
            list(args), kwargs or {})

    def search_read(self, model, domain, fields=None, limit=None, order=None):
        options = {"fields": fields or []}
        if limit:
            options["limit"] = limit
        if order:
            options["order"] = order
        return self.call(model, "search_read", domain, **options)

    def create(self, model, values):
        return self.call(model, "create", [values])

    def write(self, model, ids, values):
        return self.call(model, "write", ids, values)

    # ------------------------------------------------------------------
    # The handful of things the agents actually do
    # ------------------------------------------------------------------
    def source_id(self, code):
        """Resolve a lead source, refusing to invent one.

        Deliberately a lookup and not a get-or-create: a source records how a
        list was assembled, which is a claim a person has to make on purpose.
        """
        found = self.search_read(
            "majal.lead.source", [("code", "=", code)], ["id", "name"], limit=1)
        if not found:
            raise SystemExit(
                "No lead source with code %r. Create it in Majal Sales → "
                "Configuration → Lead Sources, describing how the list was "
                "assembled, then run this again." % code)
        return found[0]["id"]

    def leads_needing_research(self, limit=50):
        """Managed leads with no segment or size recorded yet."""
        return self.search_read(
            "crm.lead",
            [("majal_managed", "=", True), ("majal_size_band", "=", False)],
            ["id", "name", "partner_name", "contact_name", "function",
             "website", "email_from", "majal_country_code", "description"],
            limit=limit, order="id asc",
        )

    def leads_replied(self, limit=50):
        return self.search_read(
            "crm.lead",
            [("majal_managed", "=", True),
             ("majal_sequence_state", "=", "replied")],
            ["id", "name", "partner_name", "contact_name", "email_from",
             "majal_country_code", "majal_lang", "majal_icp_tier"],
            limit=limit, order="write_date desc",
        )

    def publishing_queue(self, platform=None, limit=20):
        return self.call(
            "majal.content.post", "publishing_queue",
            platform=platform, limit=limit)

    def mark_published(self, post_id, external_id=None):
        return self.call(
            "majal.content.post", "action_mark_published",
            [post_id], external_id=external_id)

    def mark_failed(self, post_id, reason):
        return self.call(
            "majal.content.post", "action_mark_failed", [post_id], reason=reason)

    def queue_post(self, values):
        """Create a social post as a draft and put it up for approval."""
        post_id = self.create("majal.content.post", values)
        self.call("majal.content.post", "action_submit_for_approval", [post_id])
        return post_id
