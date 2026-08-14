"""What has been bought, from whom, against which job.

Two things get committed on a construction project and they are bought
differently. Materials go out on a purchase order — purchase.order already
carries construction_project_id and routes the receipt into the project's
site store — and packages of work go out as subcontracts. A procurement
screen that showed only one of them would understate the commitment on every
job, which is the number that decides whether there is budget left.

So this unions the two at a common grain: one row per committed line,
whatever kind of commitment it is. `source` says which, so a buyer can look
at materials alone and a commercial manager can look at everything.

Received quantity and on-time delivery only mean anything for a purchase
order; a subcontract's progress is certified, not delivered, and those rows
report zero rather than pretending otherwise.
"""

from odoo import fields, models, tools


class MajalProcurementReport(models.Model):
    _name = "majal.procurement.report"
    _description = "Procurement Analysis"
    _auto = False
    _order = "date_order desc"

    source = fields.Selection(
        [("purchase", "Purchase Order"), ("subcontract", "Subcontract")],
        readonly=True, string="Commitment Type")
    project_id = fields.Many2one("project.project", readonly=True)
    partner_id = fields.Many2one("res.partner", string="Vendor", readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    currency_id = fields.Many2one("res.currency", readonly=True)
    product_id = fields.Many2one("product.product", readonly=True)
    category_id = fields.Many2one(
        "product.category", string="Product Category", readonly=True)
    description = fields.Char(readonly=True)
    date_order = fields.Date(readonly=True, string="Ordered")
    state = fields.Char(readonly=True)

    qty_ordered = fields.Float(readonly=True, string="Ordered Qty")
    qty_received = fields.Float(
        readonly=True, string="Received Qty",
        help="Purchase orders only. A subcontract's progress is certified "
             "rather than delivered, so those rows read zero.")
    amount_committed = fields.Monetary(readonly=True)
    amount_outstanding = fields.Monetary(
        readonly=True, string="Not Yet Received",
        help="Ordered but not delivered. On a live job this is the exposure "
             "sitting with suppliers.")
    is_late = fields.Boolean(
        readonly=True, string="Past Due",
        help="Promised before today and still not fully received.")

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
        SELECT
            -- Ids from two tables in one view need a namespace, or a
            -- purchase line and a subcontract line collide on id 1 and the
            -- ORM silently shows one where the other should be.
            (l.id * 10 + 1)                             AS id,
            'purchase'                                  AS source,
            po.construction_project_id                  AS project_id,
            po.partner_id                               AS partner_id,
            po.company_id                               AS company_id,
            po.currency_id                              AS currency_id,
            l.product_id                                AS product_id,
            pt.categ_id                                 AS category_id,
            l.name                                      AS description,
            po.date_order::date                         AS date_order,
            po.state                                    AS state,
            l.product_qty                               AS qty_ordered,
            COALESCE(l.qty_received, 0.0)               AS qty_received,
            l.price_subtotal                            AS amount_committed,
            CASE WHEN l.product_qty > COALESCE(l.qty_received, 0.0)
                 THEN l.price_subtotal
                      * (l.product_qty - COALESCE(l.qty_received, 0.0))
                      / NULLIF(l.product_qty, 0)
                 ELSE 0.0 END                           AS amount_outstanding,
            (l.date_planned IS NOT NULL
             AND l.date_planned < NOW()
             AND l.product_qty > COALESCE(l.qty_received, 0.0))
                                                        AS is_late
          FROM purchase_order_line l
          JOIN purchase_order po ON po.id = l.order_id
          LEFT JOIN product_product pp ON pp.id = l.product_id
          LEFT JOIN product_template pt ON pt.id = pp.product_tmpl_id
         WHERE po.state NOT IN ('cancel')
           AND po.construction_project_id IS NOT NULL

         UNION ALL

        SELECT
            (sl.id * 10 + 2)                            AS id,
            'subcontract'                               AS source,
            sc.project_id                               AS project_id,
            sc.subcontractor_id                         AS partner_id,
            sc.company_id                               AS company_id,
            sc.currency_id                              AS currency_id,
            NULL::integer                               AS product_id,
            NULL::integer                               AS category_id,
            sl.name                                     AS description,
            sc.date_start                               AS date_order,
            sc.state                                    AS state,
            sl.quantity                                 AS qty_ordered,
            0.0                                         AS qty_received,
            sl.amount                                   AS amount_committed,
            0.0                                         AS amount_outstanding,
            FALSE                                       AS is_late
          FROM construction_subcontract_line sl
          JOIN construction_subcontract sc ON sc.id = sl.subcontract_id
         WHERE sc.state <> 'draft'
            )
        """)
