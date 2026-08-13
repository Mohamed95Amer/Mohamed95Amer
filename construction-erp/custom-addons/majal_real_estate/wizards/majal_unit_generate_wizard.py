from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalUnitGenerateWizard(models.TransientModel):
    """Stamp out one unit per selected floor from a unit type template,
    e.g. A101, A201, ... A2501 from "1BR Type A" across Tower A. Exceptions
    to the template are made afterwards on the generated unit itself; this
    wizard only creates the starting point.
    """

    _name = "majal.unit.generate.wizard"
    _description = "Generate Units From a Unit Type"

    development_id = fields.Many2one("majal.development", required=True)
    unit_type_id = fields.Many2one(
        "majal.unit.type", required=True,
        domain="[('development_id', '=', development_id)]")
    building_id = fields.Many2one(
        "majal.building", required=True,
        domain="[('development_id', '=', development_id)]")
    floor_ids = fields.Many2many(
        "majal.floor", string="Floors", required=True,
        domain="[('building_id', '=', building_id)]")
    code_prefix = fields.Char(
        required=True,
        help='Prepended to the floor number, e.g. "A" for Tower A.')
    code_suffix = fields.Char(
        default="01", required=True,
        help='Appended to the floor number to distinguish units generated '
             'on the same floor by different runs of this wizard, e.g. '
             '"01" for the first unit type placed on each floor.')

    @api.onchange("building_id")
    def _onchange_building_id(self):
        for wizard in self:
            wizard.code_prefix = wizard.building_id.code or wizard.code_prefix
            wizard.floor_ids = False

    def _unit_name(self, floor):
        return f"{self.code_prefix}{floor.number}{self.code_suffix}"

    def action_generate(self):
        self.ensure_one()
        unit_type = self.unit_type_id
        conflicts = []
        vals_list = []
        for floor in self.floor_ids:
            name = self._unit_name(floor)
            if self.env["majal.unit"].search_count(
                    [("name", "=", name), ("building_id", "=", self.building_id.id)]):
                conflicts.append(name)
                continue
            vals_list.append({
                "name": name,
                "floor_id": floor.id,
                "unit_type_id": unit_type.id,
                "unit_category": unit_type.unit_category,
                "bedrooms": unit_type.bedrooms,
                "bathrooms": unit_type.bathrooms,
                "suite_area": unit_type.suite_area,
                "balcony_area": unit_type.balcony_area,
                "list_price": unit_type.typical_price,
            })
        if conflicts:
            raise UserError(
                self.env._(
                    "These unit codes already exist in %(building)s: %(codes)s. "
                    "Change the code prefix/suffix or remove those floors "
                    "before generating.",
                    building=self.building_id.display_name,
                    codes=", ".join(conflicts),
                )
            )
        units = self.env["majal.unit"].create(vals_list)
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Generated Units"),
            "res_model": "majal.unit",
            "view_mode": "list,form",
            "domain": [("id", "in", units.ids)],
        }
