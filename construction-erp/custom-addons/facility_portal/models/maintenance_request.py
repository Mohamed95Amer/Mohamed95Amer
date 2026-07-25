from odoo import fields, models


class MaintenanceRequestPortal(models.Model):
    """Portal access to a work order.

    Occupants are the people who notice a fault first and are usually the last
    to hear what happened about it. Letting them raise and follow a request
    turns the FM team's inbox into a queue everyone can see, and the SLA clocks
    that already exist give the occupant an honest answer to "when" instead of
    an estimate someone invented on the phone.
    """

    _name = "maintenance.request"
    _inherit = ["maintenance.request", "portal.mixin"]

    portal_reporter_id = fields.Many2one(
        "res.partner",
        string="Reported By (Portal)",
        index=True,
        help="Occupant who raised the request from the portal. Scoping is done "
             "on this rather than the internal user, since a portal user has "
             "no employee record.",
    )

    def _compute_access_url(self):
        super()._compute_access_url()
        for request in self:
            request.access_url = f"/my/facility/request/{request.id}"
