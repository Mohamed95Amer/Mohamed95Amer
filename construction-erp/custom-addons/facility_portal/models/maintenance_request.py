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


class MaintenanceEquipmentPortal(models.Model):
    """Only equipment somebody has published is offered on the portal.

    The fault form used to list every asset in the database, which told any
    occupant of any building the names of every chiller, pump and panel the
    company maintains — including other clients'. Opt-in rather than opt-out:
    nothing appears until it is deliberately published.
    """

    _inherit = "maintenance.equipment"

    portal_selectable = fields.Boolean(
        string="Show on Portal",
        help="Occupants can pick this asset when reporting a fault. Leave off "
             "for anything they should not be able to enumerate.",
    )
