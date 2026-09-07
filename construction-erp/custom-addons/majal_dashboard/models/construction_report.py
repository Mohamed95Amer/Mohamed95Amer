"""The commercial position of every project, in a shape a chart can read.

The numbers upper management actually asks for — contract value, cost to
date, earned margin, forecast margin — live on project.project as computed
fields with store=False. Odoo cannot group or sum an unstored field, so the
figures that matter were precisely the ones no graph or pivot could show.

There were two ways out. Storing the CVR fields is less code, but a stored
compute is only as fresh as its @api.depends, and a missed dependency shows
as a stale margin on a director's screen — authoritative and wrong, which is
worse than slow. This is the other way: a Postgres view over the same source
tables, aggregated once by the database.

The obvious objection to a SQL view is that it restates the margin logic, and
two implementations that disagree are worse than one that is slow. That is a
real risk and it is answered directly: test_construction_report.py builds a
project through the ORM and asserts, field by field, that this view returns
what project.project's own compute returns. Drift fails the build rather than
misleading somebody.

Only 'cost to date' needed care. The Python reads subcontract.amount_certified,
which is itself unstored and resolves to the newest payment's
gross_cumulative, so the view reaches through to the payment table and takes
the row with the highest sequence_no per subcontract — the same answer by the
same rule.
"""

from odoo import fields, models, tools


class MajalConstructionReport(models.Model):
    _name = "majal.construction.report"
    _description = "Construction Portfolio Analysis"
    _auto = False
    _rec_name = "project_id"
    _order = "forecast_margin"

    project_id = fields.Many2one("project.project", readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    partner_id = fields.Many2one("res.partner", string="Client", readonly=True)
    user_id = fields.Many2one("res.users", string="Project Manager", readonly=True)
    currency_id = fields.Many2one("res.currency", readonly=True)
    construction_stage = fields.Selection(
        [("tender", "Tender"), ("mobilization", "Mobilization"),
         ("execution", "Execution"), ("handover", "Handover"),
         ("dlp", "Defects Liability"), ("closed", "Closed")],
        string="Stage", readonly=True)
    date_start = fields.Date(readonly=True)

    contract_value = fields.Monetary(readonly=True)
    budget_cost = fields.Monetary(readonly=True)
    certified_value = fields.Monetary(
        readonly=True, string="Certified to Date")
    committed_cost = fields.Monetary(readonly=True)
    cost_to_date = fields.Monetary(readonly=True)
    uncommitted_budget = fields.Monetary(readonly=True)
    earned_margin = fields.Monetary(readonly=True)
    forecast_margin = fields.Monetary(readonly=True)
    tendered_margin = fields.Monetary(readonly=True)
    # The number that answers "is this job going the way we priced it".
    margin_variance = fields.Monetary(
        readonly=True, string="Margin Movement",
        help="Forecast margin less the margin the job was tendered at. "
             "Negative means the job is making less than it was priced to.")
    percent_complete = fields.Float(readonly=True, string="% Complete")
    forecast_margin_percent = fields.Float(readonly=True, string="Forecast %")

    # Counts of what drives the money, so one screen answers both "how much"
    # and "why".
    open_rfi_count = fields.Integer(readonly=True, string="Open RFIs")
    open_defect_count = fields.Integer(readonly=True, string="Open Snags")
    variation_count = fields.Integer(readonly=True, string="Variations")

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
        WITH boq AS (
            -- One bill per project: the same "limit 1" the compute uses, and
            -- for the same reason — a project may carry historic bills and
            -- the live one is the contract.
            SELECT DISTINCT ON (project_id)
                   project_id, amount_sell_total, amount_cost_total
              FROM construction_boq
             WHERE state IN ('approved', 'locked')
             ORDER BY project_id, id DESC
        ), certified AS (
            -- The newest certificate carries the cumulative figure, so only
            -- the latest one counts. Summing them would count every earlier
            -- certificate again.
            SELECT DISTINCT ON (project_id)
                   project_id, amount_work_done_cumulative AS value
              FROM construction_progress_claim
             WHERE state IN ('certified', 'invoiced', 'paid')
             ORDER BY project_id, sequence_no DESC, id DESC
        ), sc_paid AS (
            -- subcontract.amount_certified is itself unstored and resolves to
            -- the newest payment's gross_cumulative. Same rule, in SQL.
            SELECT DISTINCT ON (subcontract_id)
                   subcontract_id, gross_cumulative
              FROM construction_subcontract_payment
             ORDER BY subcontract_id, sequence_no DESC, id DESC
        ), commitments AS (
            SELECT sc.project_id,
                   SUM(sc.amount_total) AS committed,
                   SUM(COALESCE(p.gross_cumulative, 0.0)) AS paid
              FROM construction_subcontract sc
              LEFT JOIN sc_paid p ON p.subcontract_id = sc.id
             WHERE sc.state <> 'draft'
             GROUP BY sc.project_id
        ), covered AS (
            -- Budget already replaced by a let package. The compute nets this
            -- off so a package let above its own allowance shows on the first
            -- package rather than only once commitments exceed the entire
            -- budget — which happens near the end of a job, far too late to
            -- act on. DISTINCT because the ORM's mapped() over a many2one
            -- deduplicates, so two lines against one bill item count once.
            SELECT picked.project_id, SUM(bl.amount_cost) AS covered_budget
              FROM (SELECT DISTINCT sc.project_id, scl.boq_line_id
                      FROM construction_subcontract sc
                      JOIN construction_subcontract_line scl
                        ON scl.subcontract_id = sc.id
                     WHERE sc.state <> 'draft'
                       AND scl.boq_line_id IS NOT NULL) picked
              JOIN construction_boq_line bl ON bl.id = picked.boq_line_id
             GROUP BY picked.project_id
        ), rfis AS (
            SELECT project_id, COUNT(*) AS open_count
              FROM construction_rfi
             WHERE state NOT IN ('closed', 'answered')
             GROUP BY project_id
        ), snags AS (
            SELECT project_id, COUNT(*) AS open_count
              FROM construction_defect
             WHERE state NOT IN ('closed', 'verified')
             GROUP BY project_id
        ), variations AS (
            SELECT project_id, COUNT(*) AS n
              FROM construction_change_order
             GROUP BY project_id
        )
        SELECT
            p.id                                            AS id,
            p.id                                            AS project_id,
            p.company_id                                    AS company_id,
            p.partner_id                                    AS partner_id,
            p.user_id                                       AS user_id,
            COALESCE(c.currency_id,
                     (SELECT currency_id FROM res_company
                       ORDER BY id LIMIT 1))                AS currency_id,
            p.construction_stage                            AS construction_stage,
            p.date_start                                    AS date_start,
            COALESCE(b.amount_sell_total, 0.0)              AS contract_value,
            COALESCE(b.amount_cost_total, 0.0)              AS budget_cost,
            COALESCE(cert.value, 0.0)                       AS certified_value,
            COALESCE(cm.committed, 0.0)                     AS committed_cost,
            COALESCE(cm.paid, 0.0)                          AS cost_to_date,
            COALESCE(b.amount_cost_total, 0.0)
                - COALESCE(cm.committed, 0.0)               AS uncommitted_budget,
            COALESCE(cert.value, 0.0)
                - COALESCE(cm.paid, 0.0)                    AS earned_margin,
            COALESCE(b.amount_sell_total, 0.0)
                - CASE WHEN COALESCE(cv.covered_budget, 0.0) <> 0.0
                 THEN COALESCE(cm.committed, 0.0)
                      + (COALESCE(b.amount_cost_total, 0.0)
                         - cv.covered_budget)
                 ELSE GREATEST(COALESCE(b.amount_cost_total, 0.0),
                               COALESCE(cm.committed, 0.0))
            END                              AS forecast_margin,
            COALESCE(b.amount_sell_total, 0.0)
                - COALESCE(b.amount_cost_total, 0.0)        AS tendered_margin,
            (COALESCE(b.amount_sell_total, 0.0) - CASE WHEN COALESCE(cv.covered_budget, 0.0) <> 0.0
                 THEN COALESCE(cm.committed, 0.0)
                      + (COALESCE(b.amount_cost_total, 0.0)
                         - cv.covered_budget)
                 ELSE GREATEST(COALESCE(b.amount_cost_total, 0.0),
                               COALESCE(cm.committed, 0.0))
            END)
            - (COALESCE(b.amount_sell_total, 0.0)
                - COALESCE(b.amount_cost_total, 0.0))       AS margin_variance,
            CASE WHEN COALESCE(b.amount_sell_total, 0.0) <> 0.0
                 THEN COALESCE(cert.value, 0.0)
                      / b.amount_sell_total * 100.0
                 ELSE 0.0 END                               AS percent_complete,
            CASE WHEN COALESCE(b.amount_sell_total, 0.0) <> 0.0
                 THEN (COALESCE(b.amount_sell_total, 0.0) - CASE WHEN COALESCE(cv.covered_budget, 0.0) <> 0.0
                 THEN COALESCE(cm.committed, 0.0)
                      + (COALESCE(b.amount_cost_total, 0.0)
                         - cv.covered_budget)
                 ELSE GREATEST(COALESCE(b.amount_cost_total, 0.0),
                               COALESCE(cm.committed, 0.0))
            END)
                      / b.amount_sell_total * 100.0
                 ELSE 0.0 END                               AS forecast_margin_percent,
            COALESCE(r.open_count, 0)                       AS open_rfi_count,
            COALESCE(s.open_count, 0)                       AS open_defect_count,
            COALESCE(v.n, 0)                                AS variation_count
          FROM project_project p
          -- LEFT, not INNER. project_project.company_id is nullable, and an
          -- inner join silently drops those projects from the portfolio —
          -- a total that is quietly missing a job is worse than one that is
          -- obviously broken, because nobody questions it.
          LEFT JOIN res_company c   ON c.id = p.company_id
          LEFT JOIN boq b           ON b.project_id = p.id
          LEFT JOIN certified cert  ON cert.project_id = p.id
          LEFT JOIN commitments cm  ON cm.project_id = p.id
          LEFT JOIN covered cv      ON cv.project_id = p.id
          LEFT JOIN rfis r          ON r.project_id = p.id
          LEFT JOIN snags s         ON s.project_id = p.id
          LEFT JOIN variations v    ON v.project_id = p.id
         WHERE p.is_construction = TRUE
            )
        """)
