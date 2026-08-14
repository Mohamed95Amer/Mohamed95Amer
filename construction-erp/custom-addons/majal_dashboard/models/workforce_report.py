"""Current workforce load, one row per active employee.

The allocation register is intentionally kept at allocation grain because it
is the source of truth for access and planning.  A board needs a different
grain: one stable row per person with the total load they carry today.  This
view is deliberately stored in PostgreSQL so it can be grouped and charted,
while the date predicates keep it current without a second scheduled copy of
the same arithmetic.
"""

from odoo import fields, models, tools


class MajalWorkforceReport(models.Model):
    _name = "majal.workforce.report"
    _description = "Workforce Utilisation Analysis"
    _auto = False
    _rec_name = "employee_id"
    _order = "utilization_percent desc, employee_id"

    employee_id = fields.Many2one("hr.employee", readonly=True)
    user_id = fields.Many2one("res.users", string="System account",
                              readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    allocation_count = fields.Integer(string="Active allocations",
                                       readonly=True)
    utilization_percent = fields.Float(
        string="Utilisation %", readonly=True,
        help="The sum of this person's active allocations today. Values over "
             "100% are reported, not rejected, because they are a real "
             "planning risk to resolve.")
    available_percent = fields.Float(string="Available %", readonly=True)
    is_overallocated = fields.Boolean(string="Over-committed", readonly=True)

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
                SELECT
                    e.id AS id,
                    e.id AS employee_id,
                    e.user_id AS user_id,
                    e.company_id AS company_id,
                    COUNT(a.id)::integer AS allocation_count,
                    COALESCE(SUM(a.allocation_percent), 0.0)
                        AS utilization_percent,
                    GREATEST(
                        0.0,
                        100.0 - COALESCE(SUM(a.allocation_percent), 0.0)
                    ) AS available_percent,
                    COALESCE(SUM(a.allocation_percent), 0.0) > 100.0
                        AS is_overallocated
                  FROM hr_employee e
                  LEFT JOIN majal_allocation a
                    ON a.employee_id = e.id
                   AND a.active = TRUE
                   AND a.date_start <= CURRENT_DATE
                   AND (a.date_end IS NULL OR a.date_end >= CURRENT_DATE)
                 WHERE e.active = TRUE
                 GROUP BY e.id, e.user_id, e.company_id
            )
        """)
