from odoo import fields, models


class ConstructionBimProperty(models.Model):
    """One property of one element, as the authoring tool wrote it.

    Stored as rows rather than a JSON blob on the element because these are
    searched, not just displayed: "every door with a fire rating of 60 minutes"
    and "everything the architect marked as demolition" are the questions a
    model gets asked, and a blob answers neither without reading the lot.

    Values are kept as text. IFC types them, but the types are inconsistent
    between authoring tools — a fire rating arrives as IFCLABEL('60') from one
    and IFCREAL(60.) from another — and coercing them here would silently lose
    whichever the model actually said.
    """

    _name = "construction.bim.property"
    _description = "BIM Element Property"
    _order = "pset, name"

    element_id = fields.Many2one(
        "construction.bim.element", required=True, ondelete="cascade", index=True)
    model_id = fields.Many2one(
        related="element_id.model_id", store=True, index=True)
    pset = fields.Char(string="Property Set", index=True)
    name = fields.Char(required=True, index=True)
    value = fields.Char()

    _sql_constraints = [
        ("property_unique", "unique(element_id, pset, name)",
         "A property appears once per element."),
    ]
