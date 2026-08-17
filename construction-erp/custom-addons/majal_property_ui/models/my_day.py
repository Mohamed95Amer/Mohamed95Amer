from odoo import api, models

# The group every property register is gated on. My Day serves construction,
# facilities and property staff from one screen; without this gate a site
# engineer's page would run four property queries that can only ever return
# nothing, and a technician with no property access would raise on the first.
PROPERTY_GROUP = "majal_real_estate.group_majal_real_estate_user"


class ConstructionMyDay(models.AbstractModel):
    _inherit = "construction.my.day"

    @api.model
    def _registers(self):
        """Add the property registers to the shared My Day.

        Appended rather than merged into construction_ui, exactly as the
        docstring on the method being extended invites. Sections with a zero
        count are dropped upstream, so a construction-only user never sees
        these headings at all.
        """
        return super()._registers() + [
            {
                "key": "property_reservations",
                "label": self.env._("Reservations I am selling"),
                "model": "majal.reservation",
                "group": PROPERTY_GROUP,
                "icon": "fa-handshake-o",
                "domain": lambda user, today: [
                    ("user_id", "=", user.id),
                    ("state", "in", ("draft", "confirmed")),
                ],
                # A hold that lapses today is gone tomorrow.
                "urgent": lambda today: [("expiry_date", "<=", today)],
            },
            {
                "key": "property_leads",
                "label": self.env._("Leads assigned to me"),
                "model": "majal.lead",
                "group": PROPERTY_GROUP,
                "icon": "fa-users",
                "domain": lambda user, today: [
                    ("user_id", "=", user.id),
                    ("state", "=", "open"),
                ],
                "urgent": lambda today: [("expected_close_date", "<", today)],
            },
            {
                "key": "property_handovers",
                "label": self.env._("Handovers to complete"),
                "model": "majal.handover",
                "group": PROPERTY_GROUP,
                "icon": "fa-key",
                "domain": lambda user, today: [
                    ("state", "in", ("draft", "scheduled", "inspection", "ready")),
                ],
                "urgent": lambda today: [("scheduled_date", "<=", today)],
            },
            {
                "key": "property_tenant_requests",
                "label": self.env._("Tenant requests assigned to me"),
                "model": "majal.maintenance.request",
                "group": PROPERTY_GROUP,
                "icon": "fa-wrench",
                "domain": lambda user, today: [
                    ("user_id", "=", user.id),
                    ("state", "in", ("new", "in_progress")),
                ],
                "urgent": lambda today: [("priority", "=", "2")],
            },
            {
                "key": "property_rent_arrears",
                "label": self.env._("Rent overdue on my tenancies"),
                "model": "majal.lease.rent.line",
                "group": PROPERTY_GROUP,
                "icon": "fa-money",
                # lease_id.user_id is a leaf through another model, so it goes
                # via _candidate_ids: expanding an x2many/related leaf applies
                # the *other* model's record rules, and a perfectly valid rent
                # query can fail on a rule that has nothing to do with rent.
                "domain": lambda user, today: [
                    ("id", "in", self._candidate_ids("majal.lease.rent.line", [
                        ("lease_id.user_id", "=", user.id),
                        ("lease_id.state", "=", "active"),
                        ("state", "!=", "paid"),
                    ])),
                ],
                "urgent": lambda today: [("due_date", "<", today)],
            },
        ]
