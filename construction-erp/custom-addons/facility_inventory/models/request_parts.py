from odoo import api, fields, models
from odoo.exceptions import UserError


class MaintenanceRequestParts(models.Model):
    """Parts consumed on a work order, taken out of a real store.

    Before this, `parts_cost` on a work order was a number somebody typed. That
    makes every downstream figure — asset lifetime cost, contract margin,
    whether to repair or replace — an estimate dressed up as a fact.

    Consuming a part here moves stock. The cost then follows from what actually
    left the store, and the store's on-hand figure follows from the same moves,
    so the two can never drift apart.
    """

    _inherit = "maintenance.request"

    parts_line_ids = fields.One2many(
        "facility.request.part", "request_id", string="Parts", copy=False)
    parts_issued_value = fields.Monetary(
        compute="_compute_parts_issued", store=True,
        currency_field="currency_id", string="Parts Consumed",
        help="Value of spares actually taken out of the store.",
    )
    parts_from_stock = fields.Boolean(
        compute="_compute_parts_issued", store=True,
        help="Parts cost on this work order came from stock movements rather "
             "than being entered by hand.",
    )

    @api.depends("parts_line_ids.value", "parts_line_ids.state")
    def _compute_parts_issued(self):
        for request in self:
            consumed = request.parts_line_ids.filtered(
                lambda line: line.state == "consumed")
            request.parts_issued_value = sum(consumed.mapped("value"))
            request.parts_from_stock = bool(consumed)

    def action_consume_parts(self):
        """Take every planned part out of the store."""
        for request in self:
            planned = request.parts_line_ids.filtered(
                lambda line: line.state == "planned")
            if not planned:
                raise UserError(self.env._(
                    "There are no planned parts to take out of the store."))
            planned._consume()
        return True

    def _sync_parts_cost(self):
        """Let the typed figure be replaced by the measured one.

        `parts_cost` stays writable for work where a contractor supplied the
        material and nothing left our store. As soon as something does leave
        the store, the measured value wins — two numbers for the same cost is
        how double counting starts.
        """
        for request in self:
            if request.parts_from_stock:
                request.parts_cost = request.parts_issued_value


class FacilityRequestPart(models.Model):
    _name = "facility.request.part"
    _description = "Work Order Part"
    _order = "sequence, id"

    request_id = fields.Many2one(
        "maintenance.request", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    product_id = fields.Many2one(
        "product.product", string="Part", required=True,
        domain=[("is_storable", "=", True)])
    uom_id = fields.Many2one(
        "uom.uom", string="Unit", compute="_compute_uom",
        store=True, readonly=False)
    quantity = fields.Float(default=1.0, required=True)
    unit_cost = fields.Float(
        compute="_compute_value", store=True, readonly=False,
        help="Taken from the product's cost when the part is chosen, and "
             "editable for a part bought in specially.")
    value = fields.Monetary(
        compute="_compute_value", store=True, currency_field="currency_id")
    currency_id = fields.Many2one(
        related="request_id.currency_id", readonly=True)

    state = fields.Selection(
        [("planned", "Planned"), ("consumed", "Consumed")],
        default="planned", required=True, readonly=True,
    )
    move_id = fields.Many2one("stock.move", readonly=True, copy=False)
    qty_available = fields.Float(
        compute="_compute_qty_available", string="In Store",
        help="On hand in the store this work order draws from.")

    equipment_id = fields.Many2one(
        related="request_id.equipment_id", store=True, index=True)

    @api.depends("product_id")
    def _compute_uom(self):
        for line in self:
            line.uom_id = line.product_id.uom_id

    @api.depends("product_id", "quantity", "unit_cost")
    def _compute_value(self):
        for line in self:
            if not line.unit_cost and line.product_id:
                line.unit_cost = line.product_id.standard_price
            line.value = line.quantity * line.unit_cost

    @api.depends("product_id", "request_id.equipment_id")
    def _compute_qty_available(self):
        for line in self:
            store = line._store()
            if not store or not line.product_id:
                line.qty_available = 0.0
                continue
            line.qty_available = line.product_id.with_context(
                location=store.id).qty_available

    def _store(self):
        self.ensure_one()
        equipment = self.request_id.equipment_id
        return equipment._parts_store() if equipment else self.env["stock.location"]

    def _consumption_location(self):
        return self.env.ref("facility_inventory.location_facility_consumption")

    def _consume(self):
        """Move the parts out of the store and freeze their cost."""
        move_model = self.env["stock.move"]
        for line in self:
            if line.state == "consumed":
                continue
            if line.quantity <= 0:
                raise UserError(self.env._(
                    "Cannot consume a zero quantity of %s.",
                    line.product_id.display_name))
            source = line._store()
            if not source:
                raise UserError(self.env._(
                    "%s is not in a location with a parts store.",
                    line.request_id.equipment_id.display_name
                    or line.request_id.name))
            destination = line._consumption_location()
            company = (line.request_id.company_id or source.company_id
                       or self.env.company)
            move = move_model.create({
                "name": f"{line.request_id.name}: {line.product_id.display_name}",
                "product_id": line.product_id.id,
                "product_uom_qty": line.quantity,
                "product_uom": line.uom_id.id,
                "location_id": source.id,
                "location_dest_id": destination.id,
                "company_id": company.id,
            })
            move._action_confirm()
            move._action_assign()
            # Book what the technician actually fitted, not what the system
            # believes is reserved — a store hands over the part on the job
            # card even when the on-hand figure lags reality.
            move.quantity = move.product_uom_qty
            move.picked = True
            move._action_done()
            line.write({"state": "consumed", "move_id": move.id})
        requests = self.mapped("request_id")
        requests._sync_parts_cost()
        return True

    def unlink(self):
        if any(line.state == "consumed" for line in self):
            raise UserError(self.env._(
                "The part has already left the store. Reverse the stock move "
                "rather than deleting the line, or the job card and the "
                "inventory will disagree."))
        return super().unlink()
