"""Sales work, added to the screen the day already starts on.

`construction.my.day` was written with an extension point for exactly this —
"a list rather than hard-coded blocks so another module can add its own
without editing this one" — so this appends rather than forks.

Only three rows, and none of them is "approvals". The approval queue is
already the first section of My Day for every approvable document in the
suite, and outreach and social posts inherit `construction.approvable`, so
they arrive there without any help from this file. Adding a second approvals
row would show the same work twice.

What is left is the work approval does not cover: somebody replied and is
waiting on a human, a post needs finishing by hand in an app, or a message
failed and nobody would otherwise find out.
"""

from odoo import api, fields, models


class ConstructionMyDay(models.AbstractModel):
    _inherit = "construction.my.day"

    @api.model
    def _registers(self):
        registers = super()._registers()
        registers.extend([
            {
                # First of the three: a prospect who answered is the only
                # thing here with a person on the other end of it.
                "key": "majal_replies",
                "label": self.env._("Prospects who replied"),
                "model": "crm.lead",
                "icon": "fa-reply",
                "domain": lambda user, today: [
                    ("majal_managed", "=", True),
                    ("majal_sequence_state", "=", "replied"),
                ],
                # Two days is generous for a first reply and damning for a
                # third; either way it should stop looking calm.
                "urgent": lambda today: [
                    ("write_date", "<", fields.Date.subtract(today, days=2)),
                ],
            },
            {
                # Ahead of the manual tray on purpose: somebody who clicked
                # through to the site this week and is not yet in a
                # conversation is the warmest thing on this screen, and the
                # window on that closes fast.
                "key": "majal_warm",
                "label": self.env._("Showing interest — no conversation yet"),
                "model": "crm.lead",
                "icon": "fa-fire",
                "domain": lambda user, today: [
                    ("majal_managed", "=", True),
                    ("majal_engagement", "=", "warm"),
                ],
                "urgent": lambda today: [
                    ("majal_interest_score", ">=", 40),
                ],
            },
            {
                "key": "majal_manual_posts",
                "label": self.env._("Posts to publish by hand"),
                "model": "majal.content.post",
                "icon": "fa-hand-pointer-o",
                "domain": lambda user, today: [("state", "=", "manual")],
                "urgent": lambda today: [
                    ("scheduled_datetime", "<", fields.Date.subtract(
                        today, days=1)),
                ],
            },
            {
                "key": "majal_failed_outreach",
                "label": self.env._("Outreach that failed to send"),
                "model": "majal.outreach",
                "icon": "fa-exclamation-circle",
                "domain": lambda user, today: [("state", "=", "failed")],
            },
        ])
        return registers
