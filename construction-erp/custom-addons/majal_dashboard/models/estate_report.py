"""The estate: what is owned, what it is worth, what it costs to keep.

A word on what this is not. There is no property domain in this system — no
leases, no tenancies, no rent, no occupancy, no units. `facility.location` is
a site/building/floor/room hierarchy and `facility_contract` extends OCA's
contract.contract for maintenance agreements, not lettings. So this is not a
property-management dashboard in the letting sense, and building one that
showed occupancy or arrears would mean inventing data that does not exist.

What it is instead is an estate portfolio view, and every figure in it is
real: each building with the assets it holds, what those assets are worth
after depreciation, what has been spent maintaining them, and how much of
that work was planned rather than reactive. For a landlord or an owner-
operator that is the asset side of the question — the tenancy side would
need models this system does not yet have.

Grain is one row per building, since that is the unit a portfolio is managed
in. Rooms and floors roll up into the building above them.
"""

from odoo import fields, models, tools


class MajalEstateReport(models.Model):
    _name = "majal.estate.report"
    _description = "Estate Portfolio Analysis"
    _auto = False
    _rec_name = "location_id"
    _order = "book_value desc"

    location_id = fields.Many2one("facility.location", string="Property",
                                  readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    currency_id = fields.Many2one("res.currency", readonly=True)
    location_type = fields.Selection(
        [("site", "Site"), ("building", "Building"), ("floor", "Floor"),
         ("room", "Room"), ("zone", "Zone")], readonly=True)

    asset_count = fields.Integer(readonly=True, string="Assets")
    critical_asset_count = fields.Integer(
        readonly=True, string="Critical Assets",
        help="Assets whose failure stops the building working. The count that "
             "decides where a maintenance budget should go first.")
    purchase_value = fields.Monetary(readonly=True, string="Capital Value")
    book_value = fields.Monetary(
        readonly=True, string="Book Value",
        help="What the plant in this property is still worth, after "
             "depreciation. Zero until the assets are put on the depreciation "
             "register — an empty column here means unconfigured, not "
             "worthless.")
    accumulated_depreciation = fields.Monetary(readonly=True)

    workorder_count = fields.Integer(readonly=True, string="Work Orders")
    planned_workorder_count = fields.Integer(readonly=True, string="Planned")
    open_workorder_count = fields.Integer(readonly=True, string="Open")
    breached_count = fields.Integer(readonly=True, string="SLA Breaches")
    maintenance_spend = fields.Monetary(readonly=True, string="Maintenance Spend")
    # Spend against what the plant is worth. The comparison that says whether
    # a building is being maintained or kept alive.
    spend_to_value_percent = fields.Float(
        readonly=True, string="Spend / Capital %")

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
        WITH RECURSIVE tree AS (
            -- Every location, and the building it ultimately sits in. Rooms
            -- and floors report into the building above them, because that is
            -- the unit an estate is managed and budgeted in.
            SELECT l.id AS location_id,
                   CASE WHEN l.location_type IN ('site', 'building')
                        THEN l.id ELSE NULL END AS root_id,
                   l.parent_id, l.location_type
              FROM facility_location l
             UNION ALL
            SELECT t.location_id,
                   CASE WHEN p.location_type IN ('site', 'building')
                        THEN p.id ELSE t.root_id END,
                   p.parent_id, t.location_type
              FROM tree t
              JOIN facility_location p ON p.id = t.parent_id
             WHERE t.root_id IS NULL
        ), rolled AS (
            SELECT location_id, MIN(root_id) AS root_id
              FROM tree
             WHERE root_id IS NOT NULL
             GROUP BY location_id
        ), assets AS (
            SELECT COALESCE(rl.root_id, e.facility_location_id) AS root_id,
                   COUNT(*)                                   AS asset_count,
                   COUNT(*) FILTER (
                       WHERE e.criticality IN ('high', 'critical'))
                                                              AS critical_count,
                   SUM(COALESCE(e.purchase_value, 0.0))       AS purchase_value,
                   SUM(COALESCE(a.value, 0.0))                AS asset_gross,
                   SUM(COALESCE(a.value, 0.0)
                       - COALESCE(a.salvage_value, 0.0)
                       - COALESCE(posted.depreciated, 0.0))   AS book_value,
                   SUM(COALESCE(posted.depreciated, 0.0))     AS depreciated
              FROM maintenance_equipment e
              LEFT JOIN rolled rl ON rl.location_id = e.facility_location_id
              LEFT JOIN account_asset_asset a ON a.id = e.asset_id
              LEFT JOIN (
                    -- Only posted lines have actually depreciated anything;
                    -- the rest of the board is a forecast.
                    SELECT asset_id, SUM(amount) AS depreciated
                      FROM account_asset_depreciation_line
                     WHERE move_check = TRUE
                     GROUP BY asset_id
              ) posted ON posted.asset_id = a.id
             WHERE e.facility_location_id IS NOT NULL
             GROUP BY COALESCE(rl.root_id, e.facility_location_id)
        ), work AS (
            SELECT COALESCE(rl.root_id, e.facility_location_id) AS root_id,
                   COUNT(*)                                   AS wo_count,
                   COUNT(*) FILTER (WHERE r.pm_plan_id IS NOT NULL)
                                                              AS planned_count,
                   COUNT(*) FILTER (WHERE COALESCE(s.done, FALSE) = FALSE)
                                                              AS open_count,
                   COUNT(*) FILTER (WHERE r.sla_breached)      AS breached_count,
                   SUM(COALESCE(r.total_cost, 0.0))           AS spend
              FROM maintenance_request r
              JOIN maintenance_equipment e ON e.id = r.equipment_id
              LEFT JOIN rolled rl ON rl.location_id = e.facility_location_id
              LEFT JOIN maintenance_stage s ON s.id = r.stage_id
             WHERE e.facility_location_id IS NOT NULL
             GROUP BY COALESCE(rl.root_id, e.facility_location_id)
        )
        SELECT
            l.id                                        AS id,
            l.id                                        AS location_id,
            l.company_id                                AS company_id,
            COALESCE(c.currency_id,
                     (SELECT currency_id FROM res_company
                       ORDER BY id LIMIT 1))            AS currency_id,
            l.location_type                             AS location_type,
            COALESCE(a.asset_count, 0)                  AS asset_count,
            COALESCE(a.critical_count, 0)               AS critical_asset_count,
            COALESCE(a.purchase_value, 0.0)             AS purchase_value,
            COALESCE(a.book_value, 0.0)                 AS book_value,
            COALESCE(a.depreciated, 0.0)                AS accumulated_depreciation,
            COALESCE(w.wo_count, 0)                     AS workorder_count,
            COALESCE(w.planned_count, 0)                AS planned_workorder_count,
            COALESCE(w.open_count, 0)                   AS open_workorder_count,
            COALESCE(w.breached_count, 0)               AS breached_count,
            COALESCE(w.spend, 0.0)                      AS maintenance_spend,
            CASE WHEN COALESCE(a.purchase_value, 0.0) <> 0.0
                 THEN COALESCE(w.spend, 0.0) / a.purchase_value * 100.0
                 ELSE 0.0 END                           AS spend_to_value_percent
          FROM facility_location l
          -- Nullable, same as project_project — see construction_report.
          LEFT JOIN res_company c ON c.id = l.company_id
          LEFT JOIN assets a ON a.root_id = l.id
          LEFT JOIN work w   ON w.root_id = l.id
         WHERE l.location_type IN ('site', 'building')
            )
        """)
