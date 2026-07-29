from odoo import fields, models


class MajalCapabilityPack(models.Model):
    _name = "majal.capability.pack"
    _description = "Majal Optional Capability Pack"
    _order = "family, tier_rank, sequence, name"

    name = fields.Char(required=True, translate=True)
    code = fields.Char(required=True, index=True)
    family = fields.Selection(
        [
            ("procurement", "Procurement"),
            ("inventory", "Inventory"),
            ("finance", "Finance"),
            ("hr", "Human Resources"),
            ("website", "Website"),
            ("ai", "AI Administration"),
        ],
        required=True,
        index=True,
    )
    tier_rank = fields.Integer(
        required=True,
        help="Only one tier can be selected from each capability family.",
    )
    minimum_role_rank = fields.Integer(
        required=True,
        help="Minimum Majal access-level rank required for this capability.",
    )
    platform_owner_only = fields.Boolean(
        string="Platform Owner approval required",
        help="Company Administrators cannot grant this high-risk capability.",
    )
    group_ids = fields.Many2many(
        "res.groups",
        "majal_capability_pack_group_rel",
        "pack_id",
        "group_id",
        string="Protected technical grants",
        required=True,
    )
    description = fields.Text(translate=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        (
            "majal_capability_code_unique",
            "unique(code)",
            "Each capability pack code must be unique.",
        ),
        (
            "majal_capability_family_tier_unique",
            "unique(family, tier_rank)",
            "Each capability family can define a tier only once.",
        ),
    ]
