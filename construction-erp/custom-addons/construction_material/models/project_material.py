from odoo import api, fields, models


class ProjectMaterial(models.Model):
    """Site store and material position for a construction project.

    Materials are not modelled from scratch: Odoo's stock already handles
    products, quantities, valuation and moves, so a project gets a real stock
    location as its site store and every figure here is read back out of stock
    rather than kept in parallel. Duplicating inventory is how two numbers for
    the same steel end up in one system.
    """

    _inherit = "project.project"

    site_location_id = fields.Many2one(
        "stock.location",
        string="Site Store",
        copy=False,
        help="Stock location holding materials delivered to this site. "
             "Created on demand.",
    )
    material_issue_ids = fields.One2many(
        "construction.material.issue", "project_id", string="Material Issues")
    material_summary_ids = fields.One2many(
        "construction.material.summary", "project_id", string="Material Position")

    material_budget_value = fields.Monetary(
        compute="_compute_material_position", currency_field="currency_id",
        string="Material Budget",
        help="Budgeted material cost from the BOQ lines that name a product.")
    material_consumed_value = fields.Monetary(
        compute="_compute_material_position", currency_field="currency_id",
        string="Consumed Value")
    material_waste_value = fields.Monetary(
        compute="_compute_material_position", currency_field="currency_id",
        string="Waste Value")
    material_waste_percent = fields.Float(
        compute="_compute_material_position", string="Waste %",
        help="Wasted quantity as a share of everything issued out of the store "
             "— the number that says whether the site is losing material.")
    material_on_hand_value = fields.Monetary(
        compute="_compute_material_position", currency_field="currency_id",
        string="On Site Value")
    material_over_budget_count = fields.Integer(
        compute="_compute_material_position", string="Products Over Budget")

    @api.depends("material_summary_ids")
    def _compute_material_position(self):
        # One search for the whole recordset, not one per project. The summary
        # is a SQL view that flushes its sources and drops its cached rows on
        # every search — necessary, or a figure read before a movement is served
        # again after it — which makes a per-project loop pay that cost N times
        # and re-query from scratch each time. On a portfolio dashboard that was
        # the single most expensive thing on the screen.
        summary_model = self.env["construction.material.summary"]
        rows_by_project = {project.id: summary_model for project in self}
        if self.ids:
            for row in summary_model.search([("project_id", "in", self.ids)]):
                project_id = row.project_id.id
                if project_id in rows_by_project:
                    rows_by_project[project_id] |= row

        for project in self:
            rows = rows_by_project[project.id]
            project.material_budget_value = sum(rows.mapped("budget_value"))
            project.material_consumed_value = sum(rows.mapped("consumed_value"))
            project.material_waste_value = sum(rows.mapped("waste_value"))
            project.material_on_hand_value = sum(rows.mapped("on_hand_value"))
            consumed = sum(rows.mapped("qty_consumed"))
            wasted = sum(rows.mapped("qty_wasted"))
            issued = consumed + wasted
            project.material_waste_percent = (wasted / issued * 100) if issued else 0.0
            project.material_over_budget_count = len(
                rows.filtered(lambda r: r.qty_budget and r.qty_variance > 0)
            )

    def _material_parent_location(self):
        """Return a company-compatible view location for this project's store.

        The XML seed is created in the installing company.  In a multi-company
        database, reusing it for another company makes ``stock.location`` reject
        the child location during ``_check_company``.  Keep the shared seed for
        its own company (and for a company-neutral seed), but create one stable
        top-level view per additional company.
        """
        self.ensure_one()
        company = self.company_id or self.env.company
        seeded_parent = self.env.ref(
            "construction_material.location_construction_sites"
        )
        if not seeded_parent.company_id or seeded_parent.company_id == company:
            return seeded_parent

        location_model = self.env["stock.location"].sudo()
        company_parent = location_model.search([
            ("name", "=", "Construction Sites"),
            ("usage", "=", "view"),
            ("company_id", "=", company.id),
            ("location_id", "=", False),
        ], limit=1)
        if not company_parent:
            company_parent = location_model.create({
                "name": "Construction Sites",
                "usage": "view",
                "company_id": company.id,
            })
        return company_parent

    def ensure_site_location(self):
        """Create the site store on first use.

        Done lazily rather than for every project on install: a tender-stage job
        with no deliveries does not need a location cluttering the warehouse
        tree.
        """
        location_model = self.env["stock.location"].sudo()
        for project in self:
            if project.site_location_id:
                continue
            parent = project._material_parent_location()
            # A project without an explicit company still needs a store, and it
            # must sit in the same company as its parent or stock refuses the
            # pair as incompatible.
            company = project.company_id or parent.company_id or self.env.company
            project.site_location_id = location_model.create({
                "name": project.name,
                "usage": "internal",
                "location_id": parent.id,
                "company_id": company.id,
            })
        return self.mapped("site_location_id")

    def action_open_material_summary(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Material Position"),
            "res_model": "construction.material.summary",
            "view_mode": "list",
            "domain": [("project_id", "=", self.id)],
        }

    def action_open_site_stock(self):
        self.ensure_one()
        self.ensure_site_location()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Stock at %s", self.name),
            "res_model": "stock.quant",
            "view_mode": "list,form",
            "domain": [("location_id", "child_of", self.site_location_id.id)],
        }
