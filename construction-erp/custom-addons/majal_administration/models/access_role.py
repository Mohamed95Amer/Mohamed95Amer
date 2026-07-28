from odoo import fields, models


class MajalAccessRole(models.Model):
    _name = "majal.access.role"
    _description = "Majal Access Role"
    _order = "rank desc, name"

    name = fields.Char(required=True, translate=True)
    code = fields.Selection(
        [
            ("platform_owner", "Platform Owner"),
            ("company_admin", "Company Administrator"),
            ("operations_manager", "Operations Manager"),
            ("manager", "Project / Facility Manager"),
            ("supervisor", "Engineer / Supervisor"),
            ("field_user", "Field User / Technician"),
        ],
        required=True,
        index=True,
    )
    rank = fields.Integer(required=True, index=True)
    description = fields.Text(translate=True)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ("majal_role_code_unique", "unique(code)", "Each Majal role code must be unique."),
    ]

    def name_get(self):
        return [(record.id, record.name) for record in self]
