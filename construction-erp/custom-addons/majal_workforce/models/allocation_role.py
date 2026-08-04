from odoo import fields, models


class MajalAllocationRole(models.Model):
    """What somebody is on a project, rather than what they may do in the system.

    A model and not a Selection: this is sold to more than one contractor, and
    job titles are the most parochial thing in construction — one client's
    "Site Engineer" is another's "Works Supervisor", and a Selection would mean
    a code change per customer. Access is decided by the Majal access level,
    which is a separate axis on purpose: a foreman and a QS can hold the same
    level while doing entirely different jobs.
    """

    _name = "majal.allocation.role"
    _description = "Majal Allocation Role"
    _order = "sequence, name"

    name = fields.Char(required=True, translate=True)
    code = fields.Char(required=True, index=True)
    sequence = fields.Integer(default=10)
    scope = fields.Selection(
        [
            ("construction", "Construction"),
            ("facilities", "Facilities Management"),
            ("both", "Both"),
        ],
        default="both",
        required=True,
    )
    is_lead = fields.Boolean(
        string="Leads the team",
        help="Shown first on the team list. Does not by itself grant any "
             "permission — access comes from the person's Majal access level.",
    )
    grants_access = fields.Boolean(
        string="Grants access to the work",
        default=True,
        help="Uncheck for roles that are recorded but should not see the "
             "project in the system, such as agency labour.",
    )
    default_percent = fields.Float(string="Default % of time", default=100.0)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ("majal_allocation_role_code_unique", "unique(code)",
         "Each allocation role code must be unique."),
    ]
