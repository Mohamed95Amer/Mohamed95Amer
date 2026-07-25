from odoo import api, fields, models

# Which model measure answers a bill line, decided from the line's unit of
# measure. Mapped by xmlid rather than by category name, which is translated
# and would stop matching the moment somebody works in Arabic.
MEASURE_BY_CATEGORY = {
    "uom.uom_categ_length": "length",
    "uom.uom_categ_surface": "area",
    "uom.product_uom_categ_vol": "volume",
    "uom.product_uom_categ_unit": "count",
    "uom.product_uom_categ_kgm": "weight",
}


class ConstructionBoqLineFromModel(models.Model):
    """What the model says about a bill item.

    A BOQ is somebody's measurement of a design, taken by hand and usually
    months before the model reached its current state. The model carries its
    own quantities, so the two can be compared — and the difference between
    "the bill says 120 m³" and "the model says 118.4 m³" is the difference
    between finding a measurement error now and finding it in a final account.

    Nothing here overwrites the bill. The quantity somebody is being paid
    against is a commercial position, not a number a re-export gets to change.
    """

    _inherit = "construction.boq.line"

    bim_element_ids = fields.One2many(
        "construction.bim.element", "boq_line_id", string="Model Elements")
    bim_measure = fields.Selection(
        [("length", "Length"), ("area", "Area"), ("volume", "Volume"),
         ("count", "Count"), ("weight", "Weight")],
        compute="_compute_bim_measure", store=True, readonly=False,
        help="Which model quantity answers this line. Taken from the unit of "
             "measure, and editable where the model measures it differently.",
    )
    bim_quantity = fields.Float(
        compute="_compute_bim_quantity", store=True,
        digits="Product Unit of Measure", string="Model Quantity")
    bim_element_count = fields.Integer(
        compute="_compute_bim_quantity", store=True)
    bim_variance = fields.Float(
        compute="_compute_bim_quantity", store=True,
        digits="Product Unit of Measure",
        help="Model quantity less billed quantity. Negative means the model "
             "contains less than the bill is measured against.")
    bim_variance_percent = fields.Float(
        compute="_compute_bim_quantity", store=True)

    @api.depends("uom_id")
    def _compute_bim_measure(self):
        by_category = {}
        for xmlid, measure in MEASURE_BY_CATEGORY.items():
            category = self.env.ref(xmlid, raise_if_not_found=False)
            if category:
                by_category[category.id] = measure
        for line in self:
            # Left blank rather than guessed when the category is not one a
            # model measures: a wrong default here reads as a real variance.
            line.bim_measure = by_category.get(line.uom_id.category_id.id, False)

    @api.depends("bim_measure", "bim_element_ids",
                 "bim_element_ids.quantity_length", "bim_element_ids.quantity_area",
                 "bim_element_ids.quantity_volume", "bim_element_ids.quantity_count",
                 "bim_element_ids.quantity_weight", "quantity")
    def _compute_bim_quantity(self):
        for line in self:
            elements = line.bim_element_ids
            line.bim_element_count = len(elements)
            if not elements or not line.bim_measure:
                line.bim_quantity = 0.0
                line.bim_variance = 0.0
                line.bim_variance_percent = 0.0
                continue
            field = f"quantity_{line.bim_measure}"
            line.bim_quantity = sum(elements.mapped(field))
            line.bim_variance = line.bim_quantity - line.quantity
            line.bim_variance_percent = (
                line.bim_variance / line.quantity * 100 if line.quantity else 0.0)

    def action_view_bim_elements(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Model Elements"),
            "res_model": "construction.bim.element",
            "view_mode": "list,form",
            "domain": [("boq_line_id", "=", self.id)],
        }
