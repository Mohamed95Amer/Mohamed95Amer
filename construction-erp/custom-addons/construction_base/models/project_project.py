from odoo import api, fields, models


class ProjectProject(models.Model):
    _inherit = "project.project"

    is_construction = fields.Boolean(string="Construction Project")
    project_code = fields.Char(
        copy=False,
        readonly=True,
        help="Short unique code used as prefix for all project documents "
        "(RFIs, submittals, claims...).",
    )
    construction_stage = fields.Selection(
        [
            ("tender", "Tender"),
            ("mobilization", "Mobilization"),
            ("execution", "Execution"),
            ("handover", "Handover"),
            ("dlp", "Defects Liability Period"),
            ("closed", "Closed"),
        ],
        default="tender",
        tracking=True,
    )
    project_type = fields.Selection(
        [
            ("building", "Building"),
            ("infrastructure", "Infrastructure"),
            ("fitout", "Fit-Out"),
            ("mep", "MEP"),
            ("facility", "Facility Management"),
            ("other", "Other"),
        ],
        default="building",
    )
    client_id = fields.Many2one("res.partner", string="Client / Employer")
    consultant_id = fields.Many2one("res.partner", string="Consultant / Engineer")
    main_contractor_id = fields.Many2one("res.partner", string="Main Contractor")
    site_address = fields.Text()
    contract_value = fields.Monetary(currency_field="currency_id", tracking=True)
    currency_id = fields.Many2one(
        "res.currency",
        default=lambda self: self.env.company.currency_id,
    )
    retention_percent = fields.Float(
        string="Retention (%)",
        default=10.0,
        help="Percentage withheld from each progress payment.",
    )
    retention_cap_percent = fields.Float(
        string="Retention Cap (% of contract)",
        default=5.0,
        help="Maximum cumulative retention as a percentage of the contract value.",
    )
    date_commencement = fields.Date(string="Commencement Date")
    date_completion_planned = fields.Date(string="Planned Completion")
    date_taking_over = fields.Date(string="Taking-Over Date")
    date_dlp_end = fields.Date(string="DLP End Date")

    _sql_constraints = [
        (
            "project_code_uniq",
            "unique(project_code, company_id)",
            "The project code must be unique per company.",
        ),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("is_construction") and not vals.get("project_code"):
                vals["project_code"] = self.env["ir.sequence"].next_by_code(
                    "construction.project.code"
                )
        return super().create(vals_list)
