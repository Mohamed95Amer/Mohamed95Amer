from odoo import api, fields, models, tools


class ConstructionMaterialSummary(models.Model):
    """Material position per project and product.

    The question this answers is the one a construction manager is actually
    asked: for every material on this job, how much did we price, how much have
    we put into the works, how much did we lose, and what is still in the store.
    Over-consumption against the bill is the early signal of waste, theft or a
    mis-measured quantity, and it is invisible until budget and actual sit on
    one row.

    A database view rather than stored fields: every input already lives in the
    BOQ, in stock moves and in scrap records, so a copy would only introduce a
    second version of the truth that has to be kept in step.
    """

    _name = "construction.material.summary"
    _description = "Project Material Position"
    _auto = False
    _order = "project_id, product_id"

    project_id = fields.Many2one("project.project", readonly=True)
    product_id = fields.Many2one("product.product", readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    currency_id = fields.Many2one("res.currency", readonly=True)
    uom_id = fields.Many2one("uom.uom", string="UoM", readonly=True)

    qty_budget = fields.Float(string="Budgeted Qty", readonly=True)
    qty_consumed = fields.Float(string="Consumed", readonly=True)
    qty_wasted = fields.Float(string="Wasted", readonly=True)
    qty_on_hand = fields.Float(string="On Site", readonly=True)

    unit_cost = fields.Float(readonly=True)
    budget_value = fields.Monetary(
        currency_field="currency_id", readonly=True)
    consumed_value = fields.Monetary(
        currency_field="currency_id", readonly=True)
    waste_value = fields.Monetary(
        currency_field="currency_id", readonly=True)
    on_hand_value = fields.Monetary(
        currency_field="currency_id", readonly=True)

    qty_variance = fields.Float(
        string="Over / Under Budget", readonly=True,
        help="Consumed plus wasted, less the budgeted quantity. Positive means "
             "the job has used more material than it priced.")
    variance_percent = fields.Float(string="Variance %", readonly=True)
    waste_percent = fields.Float(
        string="Waste %", readonly=True,
        help="Wasted as a share of everything issued from the store.")

    # Models the view reads straight from SQL. Odoo only flushes the model
    # being searched, so without this a read that follows a write in the same
    # request sees stale rows — stock.move.quantity in particular is a stored
    # compute that may not have reached the table yet.
    _SOURCE_MODELS = (
        "construction.boq",
        "construction.boq.line",
        "construction.material.issue",
        "stock.move",
        "stock.scrap",
        "stock.quant",
        "project.project",
    )

    def _flush_sources(self):
        for model in self._SOURCE_MODELS:
            if model in self.env:
                self.env[model].flush_model()

    @api.model
    def search_fetch(self, domain, field_names, offset=0, limit=None, order=None):
        self._flush_sources()
        return super().search_fetch(domain, field_names, offset, limit, order)

    @api.model
    def _search(self, domain, offset=0, limit=None, order=None, **kwargs):
        self._flush_sources()
        return super()._search(domain, offset, limit, order, **kwargs)

    @api.model
    def _read_group(self, domain, groupby=(), aggregates=(), having=(),
                    offset=0, limit=None, order=None):
        self._flush_sources()
        return super()._read_group(
            domain, groupby, aggregates, having, offset, limit, order)

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
                WITH
                -- What the bill priced, for BOQ lines that name a product.
                budget AS (
                    SELECT b.project_id,
                           l.product_id,
                           SUM(l.quantity) AS qty
                      FROM construction_boq_line l
                      JOIN construction_boq b ON b.id = l.boq_id
                     WHERE l.product_id IS NOT NULL
                       AND b.state <> 'draft'
                     GROUP BY b.project_id, l.product_id
                ),
                -- Issued into the works: moves booked by a material issue.
                consumed AS (
                    SELECT i.project_id,
                           m.product_id,
                           SUM(m.quantity) AS qty
                      FROM stock_move m
                      JOIN construction_material_issue i
                        ON i.id = m.construction_issue_id
                     WHERE m.state = 'done'
                     GROUP BY i.project_id, m.product_id
                ),
                -- Lost on site: validated scrap attributed to the project.
                wasted AS (
                    SELECT s.project_id,
                           s.product_id,
                           SUM(s.scrap_qty) AS qty
                      FROM stock_scrap s
                     WHERE s.state = 'done'
                       AND s.project_id IS NOT NULL
                     GROUP BY s.project_id, s.product_id
                ),
                -- Still in the site store.
                on_hand AS (
                    SELECT p.id AS project_id,
                           q.product_id,
                           SUM(q.quantity) AS qty
                      FROM stock_quant q
                      JOIN stock_location loc ON loc.id = q.location_id
                      JOIN project_project p ON p.site_location_id IS NOT NULL
                       AND loc.parent_path LIKE
                           (SELECT l2.parent_path || '%%'
                              FROM stock_location l2
                             WHERE l2.id = p.site_location_id)
                     GROUP BY p.id, q.product_id
                ),
                -- A project may carry no explicit company; fall back to the
                -- first one so its materials still report rather than being
                -- silently dropped by an inner join.
                fallback AS (
                    SELECT id, currency_id FROM res_company ORDER BY id LIMIT 1
                ),
                keys AS (
                    SELECT project_id, product_id FROM budget
                    UNION SELECT project_id, product_id FROM consumed
                    UNION SELECT project_id, product_id FROM wasted
                    UNION SELECT project_id, product_id FROM on_hand
                )
                SELECT
                    row_number() OVER (ORDER BY k.project_id, k.product_id) AS id,
                    k.project_id,
                    k.product_id,
                    pr.company_id,
                    COALESCE(comp.currency_id, fb.currency_id) AS currency_id,
                    tmpl.uom_id AS uom_id,
                    COALESCE(b.qty, 0) AS qty_budget,
                    COALESCE(c.qty, 0) AS qty_consumed,
                    COALESCE(w.qty, 0) AS qty_wasted,
                    COALESCE(o.qty, 0) AS qty_on_hand,
                    cost.value AS unit_cost,
                    COALESCE(b.qty, 0) * cost.value AS budget_value,
                    COALESCE(c.qty, 0) * cost.value AS consumed_value,
                    COALESCE(w.qty, 0) * cost.value AS waste_value,
                    COALESCE(o.qty, 0) * cost.value AS on_hand_value,
                    (COALESCE(c.qty, 0) + COALESCE(w.qty, 0)) - COALESCE(b.qty, 0)
                        AS qty_variance,
                    CASE WHEN COALESCE(b.qty, 0) > 0
                         THEN ((COALESCE(c.qty, 0) + COALESCE(w.qty, 0))
                               - b.qty) / b.qty * 100
                         ELSE 0 END AS variance_percent,
                    CASE WHEN (COALESCE(c.qty, 0) + COALESCE(w.qty, 0)) > 0
                         THEN COALESCE(w.qty, 0)
                              / (COALESCE(c.qty, 0) + COALESCE(w.qty, 0)) * 100
                         ELSE 0 END AS waste_percent
                  FROM keys k
                  JOIN product_product prod ON prod.id = k.product_id
                  JOIN product_template tmpl ON tmpl.id = prod.product_tmpl_id
                  JOIN project_project pr ON pr.id = k.project_id
             LEFT JOIN res_company comp ON comp.id = pr.company_id
            CROSS JOIN fallback fb
                  -- standard_price is company-dependent (jsonb keyed by
                  -- company), so the cost has to be read for this project's
                  -- company rather than as a plain column.
            CROSS JOIN LATERAL (
                    SELECT COALESCE(
                        (prod.standard_price ->> COALESCE(pr.company_id, fb.id)::text)::numeric,
                        0
                    ) AS value
                 ) cost
             LEFT JOIN budget b ON b.project_id = k.project_id
                               AND b.product_id = k.product_id
             LEFT JOIN consumed c ON c.project_id = k.project_id
                                 AND c.product_id = k.product_id
             LEFT JOIN wasted w ON w.project_id = k.project_id
                               AND w.product_id = k.product_id
             LEFT JOIN on_hand o ON o.project_id = k.project_id
                                AND o.product_id = k.product_id
            )
        """)

    def action_open_moves(self):
        """Show the issues behind a row, so a variance can be traced."""
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Issues of %s", self.product_id.display_name),
            "res_model": "stock.move",
            "view_mode": "list,form",
            "domain": [
                ("construction_issue_id.project_id", "=", self.project_id.id),
                ("product_id", "=", self.product_id.id),
                ("state", "=", "done"),
            ],
        }

    def action_open_waste(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Waste of %s", self.product_id.display_name),
            "res_model": "stock.scrap",
            "view_mode": "list,form",
            "domain": [
                ("project_id", "=", self.project_id.id),
                ("product_id", "=", self.product_id.id),
            ],
        }
