from odoo import fields, models


class PurchaseOrderSite(models.Model):
    """Order materials to a project's site store.

    Deliveries previously had to be conjured with an inventory adjustment,
    which is fine for demo data and wrong for a real job: it loses the vendor,
    the price and the paper trail, so a material variance could never be traced
    back to what was ordered. Naming the project on the order sends the receipt
    into that project's store, which is what makes the material position a
    reconciliation rather than a count.

    The destination is redirected through Odoo's own hook rather than by giving
    each project its own operation type. A per-project receipts type would need
    its own sequence — sharing the warehouse's "IN" code produces duplicate
    picking names — and would multiply operation types with every job for no
    gain, since only the destination differs.
    """

    _inherit = "purchase.order"

    construction_project_id = fields.Many2one(
        "project.project",
        string="Deliver to Project",
        domain=[("is_construction", "=", True)],
        help="Receipts for this order land in the project's site store.",
    )

    def _get_destination_location(self):
        self.ensure_one()
        if self.construction_project_id:
            return self.construction_project_id.ensure_site_location().id
        return super()._get_destination_location()


class StockPickingSite(models.Model):
    _inherit = "stock.picking"

    construction_project_id = fields.Many2one(
        "project.project",
        string="Construction Project",
        related="purchase_id.construction_project_id",
        store=True,
        index=True,
    )
