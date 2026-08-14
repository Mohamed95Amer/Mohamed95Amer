from odoo import _, api, fields, models
from odoo.exceptions import UserError


class MajalReportCatalog(models.Model):
    _name = "majal.report.catalog"
    _description = "Majal Report Studio entry"
    _order = "sequence, category, name"

    name = fields.Char(required=True, translate=True, index=True)
    description = fields.Text(translate=True)
    category = fields.Selection(
        [
            ("construction", "Construction"),
            ("facilities", "Facilities"),
            ("property", "Property"),
            ("documents", "Documents"),
            ("other", "Other"),
        ],
        required=True,
        default="other",
        index=True,
    )
    sequence = fields.Integer(default=10, index=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    report_action_id = fields.Many2one(
        "ir.actions.report",
        string="Report definition",
        required=True,
        ondelete="cascade",
        index=True,
    )
    source_model = fields.Char(
        related="report_action_id.model",
        string="Source record type",
        readonly=True,
    )
    report_name = fields.Char(
        related="report_action_id.report_name",
        readonly=True,
    )

    _sql_constraints = [
        (
            "majal_report_catalog_action_company_unique",
            "unique(report_action_id, company_id)",
            "Each report is listed once per company.",
        )
    ]

    @api.model
    def _category_for_action(self, action):
        name = (action.report_name or "").lower()
        if name.startswith("construction_"):
            return "construction"
        if name.startswith("facility_"):
            return "facilities"
        if name.startswith(("majal_documents.", "majal_sign.")):
            return "documents"
        if name.startswith(("estate_", "majal_property.")):
            return "property"
        return "other"

    @api.model
    def _description_for_action(self, action):
        return _(
            "Open the source register, choose a record, and use its "
            "Majal print action to generate this report."
        )

    @api.model
    def seed_from_report_actions(self):
        actions = self.env["ir.actions.report"].sudo().search([
            ("report_type", "=", "qweb-pdf"),
            ("model", "!=", False),
            ("report_name", "!=", False),
        ])
        existing = self.sudo().search([])
        existing_keys = {
            (row.report_action_id.id, row.company_id.id) for row in existing
        }
        values = []
        for action in actions:
            for company in self.env["res.company"].sudo().search([]):
                if (action.id, company.id) in existing_keys:
                    continue
                category = self._category_for_action(action)
                values.append({
                    "name": action.name or action.report_name,
                    "description": self._description_for_action(action),
                    "category": category,
                    "sequence": {"construction": 10, "facilities": 20,
                                  "property": 30, "documents": 40,
                                  "other": 90}[category],
                    "company_id": company.id,
                    "report_action_id": action.id,
                })
        if values:
            self.sudo().create(values)
        return True

    def action_refresh_catalog(self):
        """Refresh after a vertical module adds a new report action."""
        self.env["majal.report.catalog"].seed_from_report_actions()
        return {"type": "ir.actions.client", "tag": "reload"}

    def action_open_source_records(self):
        self.ensure_one()
        action = self.report_action_id
        if not action.model:
            raise UserError(_("This report has no source record type."))
        return {
            "type": "ir.actions.act_window",
            "name": _("Records for %s") % self.name,
            "res_model": action.model,
            "view_mode": "list,form",
            "target": "current",
            "context": {
                "majal_report_action_id": action.id,
                "search_default_company_id": self.company_id.id,
            },
        }
