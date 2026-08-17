from odoo import fields, models


class MajalCheque(models.Model):
    """Rent is the other thing people pay by cheque.

    The clearing logic stays in one place: this only tells the cheque what
    else it might be settling.
    """

    _inherit = "majal.cheque"

    rent_line_id = fields.Many2one(
        "majal.lease.rent.line", string="Rent Instalment",
        ondelete="set null", index=True)
    lease_id = fields.Many2one(
        related="rent_line_id.lease_id", store=True, readonly=True)

    def _settlement_targets(self):
        targets = super()._settlement_targets()
        if self.rent_line_id:
            targets.append((self.rent_line_id, "amount_paid"))
        return targets


class MajalLeaseRentLine(models.Model):
    _inherit = "majal.lease.rent.line"

    cheque_ids = fields.One2many("majal.cheque", "rent_line_id", string="Cheques")
