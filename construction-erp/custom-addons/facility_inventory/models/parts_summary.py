from odoo import api, fields, models, tools


class FacilityPartsSummary(models.Model):
    """What each store holds, what it has consumed, and what to reorder.

    The spare-part list on an asset has always carried a minimum quantity. It
    has never meant anything, because nothing counted the stock it was a
    minimum of. With real moves behind the parts, the same number finally does
    what it was written for: it says when to buy.
    """

    _name = "facility.parts.summary"
    _description = "Facility Parts Position"
    _auto = False
    _order = "below_reorder desc, location_id, product_id"

    location_id = fields.Many2one("stock.location", string="Store", readonly=True)
    facility_location_id = fields.Many2one(
        "facility.location", string="Facility", readonly=True)
    product_id = fields.Many2one("product.product", string="Part", readonly=True)
    uom_id = fields.Many2one("uom.uom", string="Unit", readonly=True)

    qty_on_hand = fields.Float(string="In Store", readonly=True)
    qty_consumed = fields.Float(string="Consumed", readonly=True)
    min_qty = fields.Float(string="Minimum", readonly=True)
    qty_to_order = fields.Float(string="To Order", readonly=True)
    below_reorder = fields.Boolean(string="Below Minimum", readonly=True)

    unit_cost = fields.Float(readonly=True)
    on_hand_value = fields.Monetary(readonly=True, currency_field="currency_id")
    consumed_value = fields.Monetary(readonly=True, currency_field="currency_id")
    currency_id = fields.Many2one("res.currency", readonly=True)

    # The view reads these, and Odoo only auto-flushes the model being searched.
    _SOURCE_MODELS = (
        "stock.quant", "stock.move", "facility.request.part",
        "facility.spare.line", "facility.location", "product.product",
    )

    def _flush_sources(self):
        for model in self._SOURCE_MODELS:
            if model in self.env:
                self.env[model].flush_model()
        # Flushing writes the sources to the database, but rows already read
        # from this view are still sitting in the cache under ids that
        # row_number() may hand out again. Without dropping them, a position
        # read before a movement is served again after it.
        self.env[self._name].invalidate_model()

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
                -- Every store that belongs to a facility location.
                stores AS (
                    SELECT fl.id AS facility_location_id,
                           fl.stock_location_id AS location_id,
                           fl.company_id
                      FROM facility_location fl
                     WHERE fl.stock_location_id IS NOT NULL
                ),
                -- What is physically in the store right now.
                on_hand AS (
                    SELECT q.location_id, q.product_id, SUM(q.quantity) AS qty
                      FROM stock_quant q
                      JOIN stores s ON s.location_id = q.location_id
                     GROUP BY q.location_id, q.product_id
                ),
                -- What has left it on a work order. Attributed by the move's
                -- source, so a part is counted against the store it came out
                -- of rather than wherever the asset happens to sit today.
                consumed AS (
                    SELECT m.location_id, m.product_id,
                           SUM(m.product_uom_qty) AS qty
                      FROM facility_request_part p
                      JOIN stock_move m ON m.id = p.move_id
                     WHERE p.state = 'consumed' AND m.state = 'done'
                     GROUP BY m.location_id, m.product_id
                ),
                -- The minimum somebody set on the asset's spare list. An asset
                -- can appear under several locations' stores, so the strictest
                -- minimum for a product in a store wins.
                minimums AS (
                    SELECT s.location_id, sl.product_id,
                           MAX(sl.min_qty) AS min_qty
                      FROM facility_spare_line sl
                      JOIN maintenance_equipment e ON e.id = sl.equipment_id
                      JOIN stores s
                        ON s.facility_location_id = e.facility_location_id
                     GROUP BY s.location_id, sl.product_id
                ),
                keys AS (
                    SELECT location_id, product_id FROM on_hand
                    UNION
                    SELECT location_id, product_id FROM consumed
                    UNION
                    SELECT location_id, product_id FROM minimums
                )
                -- Ordered, because this id is the primary key Odoo caches
                -- and re-reads by. row_number() over an unordered scan
                -- renumbers whenever the planner picks a different order, so
                -- a row found by search could be fetched back as a different
                -- product's position — reading as a wrong quantity or a
                -- spurious below-minimum flag rather than as an error.
                -- construction.material.summary, the same view one module
                -- over, has always ordered it; this one was left out.
                SELECT row_number() OVER (ORDER BY k.location_id, k.product_id)
                           AS id,
                       k.location_id,
                       s.facility_location_id,
                       k.product_id,
                       tmpl.uom_id,
                       COALESCE(comp.currency_id, base.currency_id) AS currency_id,
                       COALESCE(o.qty, 0) AS qty_on_hand,
                       COALESCE(c.qty, 0) AS qty_consumed,
                       COALESCE(mn.min_qty, 0) AS min_qty,
                       GREATEST(COALESCE(mn.min_qty, 0) - COALESCE(o.qty, 0), 0)
                           AS qty_to_order,
                       (COALESCE(mn.min_qty, 0) > 0
                        AND COALESCE(o.qty, 0) < mn.min_qty) AS below_reorder,
                       cost.value AS unit_cost,
                       COALESCE(o.qty, 0) * cost.value AS on_hand_value,
                       COALESCE(c.qty, 0) * cost.value AS consumed_value
                  FROM keys k
                  JOIN stores s ON s.location_id = k.location_id
                  JOIN product_product prod ON prod.id = k.product_id
                  JOIN product_template tmpl ON tmpl.id = prod.product_tmpl_id
                  LEFT JOIN on_hand o
                         ON o.location_id = k.location_id
                        AND o.product_id = k.product_id
                  LEFT JOIN consumed c
                         ON c.location_id = k.location_id
                        AND c.product_id = k.product_id
                  LEFT JOIN minimums mn
                         ON mn.location_id = k.location_id
                        AND mn.product_id = k.product_id
                  LEFT JOIN res_company comp ON comp.id = s.company_id
                  -- A facility location need not carry a company; without a
                  -- fallback the join would silently drop its whole store.
                  CROSS JOIN LATERAL (
                      SELECT id, currency_id FROM res_company ORDER BY id LIMIT 1
                  ) base
                  -- standard_price lives on product_product, is company
                  -- dependent, and is stored as jsonb keyed by company — so it
                  -- has to be read for this store's company, not selected as a
                  -- plain column.
                  CROSS JOIN LATERAL (
                      SELECT COALESCE(
                          (prod.standard_price ->> COALESCE(
                              s.company_id, base.id)::text)::numeric, 0) AS value
                  ) cost
            )
        """)

    def action_open_quants(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Stock — %s", self.product_id.display_name),
            "res_model": "stock.quant",
            "view_mode": "list",
            "domain": [("location_id", "=", self.location_id.id),
                       ("product_id", "=", self.product_id.id)],
            "context": {"inventory_mode": True},
        }
