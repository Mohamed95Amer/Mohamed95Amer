"""Social posts, queued and approved in the same place as everything else.

The division of labour here is deliberate. Odoo owns the queue, the wording
and the approval; it does not talk to LinkedIn, Instagram or TikTok. The
publisher scripts in the agent layer do that, because tokens expire, APIs
change their shape every year, and none of that belongs inside a business
database that has to keep working when it does.

So the contract is small: a publisher asks for what is approved and due, posts
it, and reports back what happened.

One platform is not like the others. TikTok's Content Posting API refuses to
make a post public until the developer app has passed a separate audit —
before that, everything it publishes is forced to `SELF_ONLY`, visible to
nobody but the account holder. A queue that reported those as "published"
would be lying, so TikTok items are marked as needing a human to finish them
in the app and are never counted as posted until somebody confirms it.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError
from odoo.addons.construction_base.models.approval_mixin import (
    WORKFLOW_TRANSITION,
)

# Platforms an automated publisher can genuinely make public today. Instagram
# needs a Business or Creator account on an app in development mode with the
# account as a tester; LinkedIn needs `w_member_social`, which is self-serve.
AUTO_PUBLISHABLE = ("linkedin", "instagram")


class MajalContentPost(models.Model):
    _name = "majal.content.post"
    _description = "Majal Social Post"
    _inherit = ["construction.approvable", "mail.thread"]
    _order = "scheduled_datetime, id"

    name = fields.Char(required=True, help="Internal label, never published.")
    platform = fields.Selection(
        [
            ("linkedin", "LinkedIn"),
            ("instagram", "Instagram"),
            ("tiktok", "TikTok"),
        ],
        required=True, index=True,
    )
    lang = fields.Selection(
        [("ar", "Arabic"), ("en", "English")], default="en", required=True)
    body = fields.Text(required=True, help="The caption as it will appear.")
    media_path = fields.Char(
        help="Path or URL of the image or video the publisher should upload. "
             "Required for Instagram and TikTok.")
    link_url = fields.Char(help="Optional link, where the platform allows one.")

    pillar = fields.Selection(
        [
            ("commercial_leakage", "Commercial leakage"),
            ("offline_site", "Offline on site"),
            ("arabic_first", "Arabic-first operations"),
            ("approval_trails", "Approval trails"),
            ("product", "Product walkthrough"),
        ],
        help="Which theme this post serves. Kept so the Analyst can tell "
             "which subject actually earns replies.",
    )

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("pending", "Waiting approval"),
            ("approved", "Approved"),
            ("published", "Published"),
            ("manual", "Needs manual publish"),
            ("rejected", "Rejected"),
            ("failed", "Failed"),
        ],
        default="draft", required=True, index=True, tracking=True,
    )
    scheduled_datetime = fields.Datetime(
        default=fields.Datetime.now, required=True, index=True)
    published_datetime = fields.Datetime(readonly=True)
    external_id = fields.Char(readonly=True, help="The platform's post id.")
    failure_reason = fields.Text(readonly=True)

    requires_manual_publish = fields.Boolean(
        compute="_compute_requires_manual_publish", store=True,
        help="True for platforms an automated publisher cannot make public.",
    )

    @api.depends("platform")
    def _compute_requires_manual_publish(self):
        for record in self:
            record.requires_manual_publish = (
                record.platform not in AUTO_PUBLISHABLE)

    @api.constrains("platform", "media_path")
    def _check_media_present(self):
        for record in self:
            if record.platform in ("instagram", "tiktok") and not record.media_path:
                raise UserError(record.env._(
                    "%s posts carry media. Add the image or video before "
                    "sending “%s” for approval.",
                    dict(record._fields["platform"].selection)[record.platform],
                    record.name,
                ))

    # ------------------------------------------------------------------
    # Approval engine hooks
    # ------------------------------------------------------------------
    def _approval_kind(self):
        self.ensure_one()
        return self.platform

    def _approval_amount(self):
        return 0.0

    def _on_approval_granted(self, request):
        self._majal_set_state("approved")
        return True

    def _on_approval_refused(self, request, reason):
        self._majal_set_state("rejected")
        return True

    def _majal_set_state(self, state, **extra):
        return self.with_context(
            majal_workflow_transition=WORKFLOW_TRANSITION
        ).write(dict(extra, state=state))

    def action_submit_for_approval(self):
        for record in self:
            if record.state != "draft":
                continue
            if not record.action_request_approval():
                raise UserError(record.env._(
                    "No approval rule covers Majal social posts, so “%s” has "
                    "nobody to approve it.", record.display_name))
            record._majal_set_state("pending")
        return True

    # ------------------------------------------------------------------
    # The publisher contract
    # ------------------------------------------------------------------
    @api.model
    def publishing_queue(self, platform=None, limit=20):
        """What is approved, due, and safe to publish now.

        Called over RPC by the publisher scripts. Returns plain dictionaries
        rather than recordsets because the caller is a standalone script that
        should not need the ORM to understand the answer.
        """
        domain = [
            ("state", "=", "approved"),
            ("scheduled_datetime", "<=", fields.Datetime.now()),
            ("requires_manual_publish", "=", False),
        ]
        if platform:
            domain.append(("platform", "=", platform))
        posts = self.search(domain, limit=limit)
        return [
            {
                "id": post.id,
                "platform": post.platform,
                "lang": post.lang,
                "body": post.body,
                "media_path": post.media_path or None,
                "link_url": post.link_url or None,
            }
            for post in posts
        ]

    def action_mark_published(self, external_id=None):
        """Reported back by a publisher once the platform accepted the post."""
        return self._majal_set_state(
            "published",
            published_datetime=fields.Datetime.now(),
            external_id=external_id or False,
            failure_reason=False,
        )

    def action_mark_failed(self, reason=None):
        return self._majal_set_state(
            "failed", failure_reason=reason or self.env._("Unknown error"))

    @api.model
    def _cron_flag_manual_posts(self):
        """Move approved TikTok items into the tray a human finishes.

        They are separated from the automated queue so that "approved" never
        silently means "posted where nobody can see it".
        """
        due = self.search([
            ("state", "=", "approved"),
            ("requires_manual_publish", "=", True),
            ("scheduled_datetime", "<=", fields.Datetime.now()),
        ])
        due._majal_set_state("manual")
        return len(due)

    def action_confirm_manual_published(self):
        """Pressed by the person after they finished the post in the app."""
        wrong = self.filtered(lambda r: r.state != "manual")
        if wrong:
            raise UserError(self.env._(
                "“%s” is not waiting to be published by hand.",
                wrong[0].display_name))
        return self._majal_set_state(
            "published", published_datetime=fields.Datetime.now())
