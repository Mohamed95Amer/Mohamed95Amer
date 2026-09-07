"""Maintenance delivery, one row per work order.

Unlike the construction view this restates nothing: every measure it exposes
is already a stored column on maintenance.request. It exists to put them in
one place with the joins already made — asset, location, team, SLA, contract
— so a manager can pivot cost by building or breaches by team without
building a custom filter each time.

Deliberately one row per work order rather than pre-aggregated. Aggregating
here would fix the questions that can be asked; leaving the grain at the work
order lets the pivot ask ones nobody thought of when this was written.
"""

from odoo import fields, models, tools

# Imported rather than restated. I first wrote these out by hand and got
# them wrong — the real states are breached/at_risk/on_track/met/none, and
# a value the Selection does not know about breaks the view that groups by
# it. A copy of somebody else's list is a copy that goes stale.
from odoo.addons.facility_sla.models.maintenance_request import SLA_STATES


class MajalFacilityReport(models.Model):
    _name = "majal.facility.report"
    _description = "Maintenance Delivery Analysis"
    _auto = False
    _rec_name = "request_id"
    _order = "request_date desc"

    request_id = fields.Many2one("maintenance.request", readonly=True)
    company_id = fields.Many2one("res.company", readonly=True)
    currency_id = fields.Many2one("res.currency", readonly=True)
    equipment_id = fields.Many2one("maintenance.equipment", string="Asset",
                                   readonly=True)
    location_id = fields.Many2one("facility.location", string="Location",
                                  readonly=True)
    team_id = fields.Many2one("maintenance.team", string="Team", readonly=True)
    user_id = fields.Many2one("res.users", string="Technician", readonly=True)
    category_id = fields.Many2one("maintenance.equipment.category",
                                  string="Asset Category", readonly=True)

    request_date = fields.Date(readonly=True)
    close_date = fields.Date(readonly=True)
    maintenance_type = fields.Selection(
        [("corrective", "Corrective"), ("preventive", "Preventive")],
        readonly=True)
    priority = fields.Selection(
        [("0", "Very Low"), ("1", "Low"), ("2", "Normal"), ("3", "High")],
        readonly=True)
    is_closed = fields.Boolean(readonly=True, string="Closed")
    is_planned = fields.Boolean(
        readonly=True, string="Planned Work",
        help="Raised from a preventive maintenance plan. The planned share of "
             "the workload is the number that says whether the estate is being "
             "maintained or merely repaired.")

    labor_hours = fields.Float(readonly=True)
    labor_cost = fields.Monetary(readonly=True)
    parts_cost = fields.Monetary(readonly=True)
    contractor_cost = fields.Monetary(readonly=True)
    total_cost = fields.Monetary(readonly=True)

    sla_breached = fields.Boolean(readonly=True, string="SLA Breached")
    sla_response_state = fields.Selection(
        SLA_STATES, string="Response SLA", readonly=True)
    sla_resolution_state = fields.Selection(
        SLA_STATES, string="Resolution SLA", readonly=True)
    sla_resolution_hours_used = fields.Float(
        readonly=True, string="Working Hours Used")
    # Calendar days, not working hours: the SLA measures the promise, this
    # measures what the building actually waited.
    days_to_close = fields.Float(readonly=True, string="Days to Close")

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute(f"""
            CREATE OR REPLACE VIEW {self._table} AS (
        SELECT
            r.id                                    AS id,
            r.id                                    AS request_id,
            r.company_id                            AS company_id,
            c.currency_id                           AS currency_id,
            r.equipment_id                          AS equipment_id,
            e.facility_location_id                  AS location_id,
            r.maintenance_team_id                   AS team_id,
            r.user_id                               AS user_id,
            e.category_id                           AS category_id,
            r.request_date                          AS request_date,
            r.close_date                            AS close_date,
            r.maintenance_type                      AS maintenance_type,
            r.priority                              AS priority,
            COALESCE(s.done, FALSE)                 AS is_closed,
            (r.pm_plan_id IS NOT NULL)              AS is_planned,
            COALESCE(r.labor_hours, 0.0)            AS labor_hours,
            COALESCE(r.labor_cost, 0.0)             AS labor_cost,
            COALESCE(r.parts_cost, 0.0)             AS parts_cost,
            COALESCE(r.contractor_cost, 0.0)        AS contractor_cost,
            COALESCE(r.total_cost, 0.0)             AS total_cost,
            COALESCE(r.sla_breached, FALSE)         AS sla_breached,
            r.sla_response_state                    AS sla_response_state,
            r.sla_resolution_state                  AS sla_resolution_state,
            COALESCE(r.sla_resolution_hours_used, 0.0)
                                                    AS sla_resolution_hours_used,
            CASE WHEN r.close_date IS NOT NULL AND r.request_date IS NOT NULL
                 THEN (r.close_date - r.request_date)::numeric
                 ELSE NULL END                      AS days_to_close
          FROM maintenance_request r
          JOIN res_company c ON c.id = r.company_id
          LEFT JOIN maintenance_equipment e ON e.id = r.equipment_id
          LEFT JOIN maintenance_stage s ON s.id = r.stage_id
            )
        """)
