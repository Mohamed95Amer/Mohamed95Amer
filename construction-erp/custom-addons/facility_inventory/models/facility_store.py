from odoo import fields, models


class FacilityLocationStore(models.Model):
    """A parts store attached to a facility location.

    Construction learned this the hard way: a parts list with no stock behind
    it cannot tell you what a job cost. The same store-per-place idea applies
    here, except the place is a building rather than a project, and the thing
    consuming stock is a work order rather than a bill item.

    The store is created on first use. Most locations in a facility hierarchy
    are rooms and floors that will never hold spares, and giving every one of
    them a stock location would bury the warehouse tree.
    """

    _inherit = "facility.location"

    stock_location_id = fields.Many2one(
        "stock.location", string="Parts Store", readonly=True, copy=False,
        help="Where spares for this location are held.",
    )
    on_hand_value = fields.Monetary(
        compute="_compute_stock_figures", currency_field="currency_id")
    part_count = fields.Integer(compute="_compute_stock_figures")
    currency_id = fields.Many2one(
        related="company_id.currency_id", readonly=True)

    def _compute_stock_figures(self):
        quant_model = self.env["stock.quant"]
        for location in self:
            if not location.stock_location_id:
                location.on_hand_value = 0.0
                location.part_count = 0
                continue
            quants = quant_model.search([
                ("location_id", "child_of", location.stock_location_id.id),
                ("quantity", ">", 0),
            ])
            location.part_count = len(quants.product_id)
            location.on_hand_value = sum(
                q.quantity * q.product_id.standard_price for q in quants)

    def _store_parent_location(self):
        return self.env.ref("facility_inventory.location_facility_stores")

    def ensure_store(self):
        """Create this location's parts store on first use."""
        location_model = self.env["stock.location"].sudo()
        for location in self:
            if location.stock_location_id:
                continue
            parent = location._store_parent_location()
            # A facility location may carry no company of its own, and stock
            # refuses a child whose company differs from its parent's.
            company = (location.company_id or parent.company_id
                       or self.env.company)
            location.stock_location_id = location_model.create({
                "name": location.complete_name or location.name,
                "usage": "internal",
                "location_id": parent.id,
                "company_id": company.id,
            })
        return self.mapped("stock_location_id")

    def action_open_stock(self):
        self.ensure_one()
        self.ensure_store()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Spares at %s", self.name),
            "res_model": "stock.quant",
            "view_mode": "list,form",
            "domain": [("location_id", "child_of", self.stock_location_id.id)],
            "context": {"inventory_mode": True},
        }


class MaintenanceEquipmentStore(models.Model):
    """An asset draws its spares from the store of the place it sits in."""

    _inherit = "maintenance.equipment"

    def _parts_store(self):
        """The nearest store up the location hierarchy.

        Spares are rarely held in the room with the asset — they are in the
        building's store. Walking up means a chiller on level 3 draws from the
        tower store without anyone configuring that link per asset.
        """
        self.ensure_one()
        location = self.facility_location_id
        while location:
            if location.stock_location_id:
                return location.stock_location_id
            location = location.parent_id
        # Nothing configured yet: create one at the asset's own location.
        if self.facility_location_id:
            return self.facility_location_id.ensure_store()
        return self.env["stock.location"]
