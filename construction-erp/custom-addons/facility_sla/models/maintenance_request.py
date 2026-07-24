from datetime import timedelta

from odoo import api, fields, models

# Ordered worst-first so a breach is never masked by a healthier state.
SLA_STATES = [
    ("breached", "Breached"),
    ("at_risk", "At Risk"),
    ("on_track", "On Track"),
    ("met", "Met"),
    ("none", "No SLA"),
]


class MaintenanceRequest(models.Model):
    """SLA clocks on a work order.

    Core maintenance stores request_date/close_date as Dates, which cannot
    express a four-hour response, so this layer keeps its own datetime stamps
    and measures against the policy's business calendar rather than wall-clock
    time — a request raised at 16:00 with a four-hour response is not late at
    08:00 the next morning if the site closes at 17:00.
    """

    _inherit = "maintenance.request"

    sla_policy_id = fields.Many2one(
        "facility.sla.policy", string="SLA", readonly=True, tracking=True,
        help="Matched automatically from the work order's priority, type and "
             "the asset's category and criticality.",
    )
    sla_start = fields.Datetime(readonly=True, string="SLA Started")
    sla_response_deadline = fields.Datetime(readonly=True, string="Respond By")
    sla_resolution_deadline = fields.Datetime(readonly=True, string="Resolve By")
    sla_responded_on = fields.Datetime(readonly=True, string="First Response")
    sla_resolved_on = fields.Datetime(readonly=True, string="Resolved On")

    sla_response_state = fields.Selection(
        SLA_STATES, compute="_compute_sla_states", store=True,
        string="Response SLA", default="none",
    )
    sla_resolution_state = fields.Selection(
        SLA_STATES, compute="_compute_sla_states", store=True,
        string="Resolution SLA", default="none",
    )
    sla_breached = fields.Boolean(
        compute="_compute_sla_states", store=True,
        help="Either clock was missed. Stored so it can be filtered and "
             "grouped in reporting.",
    )
    sla_resolution_hours_used = fields.Float(
        compute="_compute_sla_states", store=True, string="Working Hours Used",
        help="Working hours consumed between raising and resolving.",
    )

    # ------------------------------------------------------------------
    # Assignment
    # ------------------------------------------------------------------
    def _assign_sla(self):
        """(Re)stamp the SLA clocks from the matching policy."""
        policy_model = self.env["facility.sla.policy"]
        for request in self:
            policy = policy_model._match(request)
            if not policy:
                request.write({
                    "sla_policy_id": False,
                    "sla_start": False,
                    "sla_response_deadline": False,
                    "sla_resolution_deadline": False,
                })
                continue
            start = request.sla_start or fields.Datetime.now()
            calendar = policy._working_calendar()
            request.write({
                "sla_policy_id": policy.id,
                "sla_start": start,
                "sla_response_deadline": self._plan(
                    calendar, policy.response_hours, start),
                "sla_resolution_deadline": self._plan(
                    calendar, policy.resolution_hours, start),
            })

    @api.model
    def _plan(self, calendar, hours, start):
        """Add working hours to a datetime, falling back to elapsed time when
        no calendar is configured (a 24/7 promise)."""
        start = fields.Datetime.to_datetime(start)
        if not calendar:
            return start + timedelta(hours=hours)
        planned = calendar.plan_hours(hours, start, compute_leaves=True)
        # plan_hours returns False if it cannot fit the hours inside the
        # calendar's horizon; falling back keeps a deadline rather than none.
        return fields.Datetime.to_datetime(planned) if planned else start + timedelta(hours=hours)

    @api.model_create_multi
    def create(self, vals_list):
        requests = super().create(vals_list)
        requests._assign_sla()
        return requests

    def write(self, vals):
        res = super().write(vals)
        # The matched policy depends on these, so a re-triage re-stamps.
        if {"priority", "maintenance_type", "equipment_id"} & set(vals):
            self.filtered(lambda r: not r.sla_resolved_on)._assign_sla()
        if "stage_id" in vals:
            self._sync_sla_progress()
        return res

    def _sync_sla_progress(self):
        """Record first response and resolution from stage movement."""
        now = fields.Datetime.now()
        for request in self:
            if not request.sla_policy_id:
                continue
            # Any movement off the opening stage counts as a first response.
            if not request.sla_responded_on and not request._is_new_stage():
                request.sla_responded_on = now
            if request.stage_id.done and not request.sla_resolved_on:
                request.sla_resolved_on = now
                if not request.sla_responded_on:
                    request.sla_responded_on = now
            elif not request.stage_id.done and request.sla_resolved_on:
                # Reopened: the resolution clock runs again.
                request.sla_resolved_on = False

    def _is_new_stage(self):
        self.ensure_one()
        first_stage = self.env["maintenance.stage"].search([], order="sequence, id", limit=1)
        return self.stage_id == first_stage

    def action_sla_respond(self):
        """Explicitly acknowledge a work order without moving its stage."""
        now = fields.Datetime.now()
        self.filtered(lambda r: r.sla_policy_id and not r.sla_responded_on).write(
            {"sla_responded_on": now}
        )

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------
    @api.depends(
        "sla_policy_id",
        "sla_response_deadline",
        "sla_resolution_deadline",
        "sla_responded_on",
        "sla_resolved_on",
    )
    def _compute_sla_states(self):
        now = fields.Datetime.now()
        for request in self:
            policy = request.sla_policy_id
            if not policy:
                request.sla_response_state = "none"
                request.sla_resolution_state = "none"
                request.sla_breached = False
                request.sla_resolution_hours_used = 0.0
                continue

            request.sla_response_state = request._clock_state(
                request.sla_response_deadline, request.sla_responded_on, now,
                policy, policy.response_hours,
            )
            request.sla_resolution_state = request._clock_state(
                request.sla_resolution_deadline, request.sla_resolved_on, now,
                policy, policy.resolution_hours,
            )
            request.sla_breached = "breached" in (
                request.sla_response_state, request.sla_resolution_state
            )
            request.sla_resolution_hours_used = request._hours_used(now)

    def _clock_state(self, deadline, achieved_on, now, policy, allowance):
        """Resolve one clock into a state.

        A clock that was stopped in time is 'met' and stays that way — a work
        order closed inside its allowance must not drift to 'breached' later.
        """
        self.ensure_one()
        if not deadline:
            return "none"
        if achieved_on:
            return "met" if achieved_on <= deadline else "breached"
        if now > deadline:
            return "breached"
        calendar = policy._working_calendar()
        used = self._working_hours_between(calendar, self.sla_start, now)
        if allowance and used >= allowance * policy.at_risk_ratio:
            return "at_risk"
        return "on_track"

    def _hours_used(self, now):
        self.ensure_one()
        if not self.sla_start:
            return 0.0
        calendar = self.sla_policy_id._working_calendar()
        end = self.sla_resolved_on or now
        return self._working_hours_between(calendar, self.sla_start, end)

    @api.model
    def _working_hours_between(self, calendar, start, end):
        if not start or not end or end <= start:
            return 0.0
        if not calendar:
            return (end - start).total_seconds() / 3600.0
        return calendar.get_work_duration_data(start, end)["hours"]

    # ------------------------------------------------------------------
    # Escalation
    # ------------------------------------------------------------------
    @api.model
    def _cron_check_sla(self):
        """Refresh SLA states and escalate anything newly at risk or breached.

        The states are stored computes over datetimes, so they only move when
        something is written — without this the passage of time alone would
        never flip a work order to breached.
        """
        # Pick up open work that has no policy yet. The install hook covers the
        # backlog at switch-on, but work can also fall outside cover later — a
        # policy is archived, criteria are retuned, or a work order predates a
        # module ordering quirk — so the sweep is the durable safety net rather
        # than trusting a single moment in time.
        uncovered = self.search([
            ("sla_policy_id", "=", False),
            ("stage_id.done", "=", False),
        ])
        if uncovered:
            uncovered._assign_sla()

        open_requests = self.search([
            ("sla_policy_id", "!=", False),
            ("sla_resolved_on", "=", False),
        ])
        if not open_requests:
            return
        before = {r.id: (r.sla_response_state, r.sla_resolution_state)
                  for r in open_requests}
        open_requests.invalidate_recordset(
            ["sla_response_state", "sla_resolution_state", "sla_breached",
             "sla_resolution_hours_used"]
        )
        open_requests.modified([
            "sla_response_deadline", "sla_resolution_deadline",
        ])
        open_requests.flush_recordset()
        for request in open_requests:
            now_states = (request.sla_response_state, request.sla_resolution_state)
            if now_states != before[request.id]:
                request._notify_sla_change(before[request.id], now_states)

    def _notify_sla_change(self, previous, current):
        """Post an escalation note when a clock degrades."""
        self.ensure_one()
        rank = {"breached": 0, "at_risk": 1, "on_track": 2, "met": 3, "none": 4}
        if min(rank[s] for s in current) >= min(rank[s] for s in previous):
            return  # not a degradation
        labels = dict(SLA_STATES)
        self.message_post(
            body=self.env._(
                "SLA update on %(policy)s — response: %(response)s, "
                "resolution: %(resolution)s.",
                policy=self.sla_policy_id.name,
                response=labels[current[0]],
                resolution=labels[current[1]],
            )
        )
