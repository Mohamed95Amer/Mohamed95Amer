from odoo import models


class FacilityInventoryDemo(models.AbstractModel):
    """Seed demo stock through the ORM.

    Stock quantities cannot be stated as plain data records — they are the
    result of moves — so the demo asks inventory to apply an adjustment the
    same way a storekeeper would.
    """

    _name = "facility.inventory.demo"
    _description = "Facility Inventory Demo Loader"

    def _load_demo_stock(self):
        store = self.env.ref(
            "facility_asset.loc_l3_plantroom").ensure_store()
        quant_model = self.env["stock.quant"].with_context(inventory_mode=True)
        for xmlid, qty in (
            ("facility_inventory.product_ahu_belt", 4),
            ("facility_inventory.product_ahu_filter", 6),
        ):
            product = self.env.ref(xmlid, raise_if_not_found=False)
            if not product:
                continue
            quant_model.create({
                "product_id": product.id,
                "location_id": store.id,
                "inventory_quantity": qty,
            })._apply_inventory()
        return True
