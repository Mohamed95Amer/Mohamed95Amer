from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

# How many months one rent instalment covers.
FREQUENCY_MONTHS = {
    "monthly": 1,
    "quarterly": 3,
    "semiannual": 6,
    "annual": 12,
}

# A unit can be let while it is any of these. "sold" is included because
# an investor who bought a unit lets it out -- that is the normal case,
# not an exception.
LETTABLE_UNIT_STATUSES = (
    "available", "vacant", "sold", "handed_over", "owner_occupied")

LEASE_HELD_STATUS = "leased"


class MajalLease(models.Model):
    """A tenancy: one tenant, one unit, one period, one rent.

    The lease owns the unit's occupancy the same way a reservation owns
    its availability -- activating one marks the unit leased, ending one
    puts it back to vacant, and the database refuses to let two live
    leases claim the same unit.
    """

    _name = "majal.lease"
    _description = "Lease"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "start_date desc, id desc"

    name = fields.Char(
        string="Reference", required=True, readonly=True, copy=False, default="/")
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="restrict", index=True, tracking=True)
    tenant_id = fields.Many2one(
        "res.partner", string="Tenant", required=True, tracking=True)
    landlord_id = fields.Many2one(
        "res.partner", string="Landlord", tracking=True,
        help="Usually the unit's owner; left empty for developer-owned stock.")
    user_id = fields.Many2one(
        "res.users", string="Property Manager", default=lambda self: self.env.user)

    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True, index=True)
    building_id = fields.Many2one(related="unit_id.building_id", store=True, readonly=True)
    floor_id = fields.Many2one(related="unit_id.floor_id", store=True, readonly=True)
    company_id = fields.Many2one(related="unit_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="unit_id.currency_id", store=True, readonly=True)

    start_date = fields.Date(required=True, default=fields.Date.context_today,
                             tracking=True)
    end_date = fields.Date(required=True, tracking=True)
    frequency = fields.Selection(
        [
            ("monthly", "Monthly"),
            ("quarterly", "Quarterly"),
            ("semiannual", "Every 6 Months"),
            ("annual", "Annual"),
        ],
        default="quarterly", required=True,
    )
    annual_rent = fields.Monetary(required=True, tracking=True)
    deposit = fields.Monetary(tracking=True)
    deposit_returned = fields.Boolean(copy=False)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("active", "Active"),
            ("expired", "Expired"),
            ("terminated", "Terminated"),
            ("cancelled", "Cancelled"),
        ],
        default="draft", required=True, tracking=True, copy=False,
    )
    termination_date = fields.Date(readonly=True, copy=False)
    termination_reason = fields.Char(copy=False)

    rent_line_ids = fields.One2many(
        "majal.lease.rent.line", "lease_id", string="Rent Schedule", copy=False)
    amount_scheduled = fields.Monetary(compute="_compute_rent_totals", store=True)
    amount_paid = fields.Monetary(compute="_compute_rent_totals", store=True)
    amount_residual = fields.Monetary(compute="_compute_rent_totals", store=True)
    next_due_date = fields.Date(compute="_compute_rent_totals", store=True)

    renewed_from_id = fields.Many2one("majal.lease", readonly=True, copy=False)
    renewal_ids = fields.One2many("majal.lease", "renewed_from_id", string="Renewals")
    notes = fields.Text()

    def init(self):
        # Two live leases on one unit would each believe they have the
        # keys. An in-Python check cannot stop two concurrent activations
        # from both passing, so the rule lives in the database.
        self.env.cr.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS majal_lease_active_unit_uniq
            ON majal_lease (unit_id) WHERE state = 'active'
            """
        )

    @api.depends("name", "unit_id")
    def _compute_display_name(self):
        for lease in self:
            unit_name = lease.unit_id.name
            lease.display_name = (
                f"{lease.name} - {unit_name}" if unit_name else lease.name)

    @api.depends("rent_line_ids.amount", "rent_line_ids.amount_paid",
                 "rent_line_ids.due_date", "rent_line_ids.state")
    def _compute_rent_totals(self):
        for lease in self:
            lease.amount_scheduled = sum(lease.rent_line_ids.mapped("amount"))
            lease.amount_paid = sum(lease.rent_line_ids.mapped("amount_paid"))
            lease.amount_residual = lease.amount_scheduled - lease.amount_paid
            unpaid = lease.rent_line_ids.filtered(
                lambda line: line.state != "paid").sorted("due_date")
            lease.next_due_date = unpaid[:1].due_date or False

    @api.constrains("start_date", "end_date")
    def _check_dates(self):
        for lease in self:
            if lease.end_date <= lease.start_date:
                raise ValidationError(
                    self.env._("A lease must end after it starts."))

    @api.constrains("state", "start_date", "end_date", "unit_id")
    def _check_no_overlapping_lease(self):
        """The unique index only stops two leases being active at the same
        moment. It cannot see that a future lease overlaps a current one,
        which is the mistake that actually gets made when a renewal is
        booked against the wrong dates."""
        for lease in self:
            if lease.state in ("cancelled", "terminated"):
                continue
            overlapping = self.search([
                ("id", "!=", lease.id),
                ("unit_id", "=", lease.unit_id.id),
                ("state", "not in", ("cancelled", "terminated")),
                ("start_date", "<=", lease.end_date),
                ("end_date", ">=", lease.start_date),
            ], limit=1)
            if overlapping:
                raise ValidationError(
                    self.env._(
                        "%(unit)s is already let under %(lease)s for an "
                        "overlapping period (%(start)s to %(end)s).",
                        unit=lease.unit_id.display_name,
                        lease=overlapping.name,
                        start=overlapping.start_date,
                        end=overlapping.end_date,
                    )
                )

    @api.onchange("unit_id")
    def _onchange_unit_id(self):
        for lease in self:
            if lease.unit_id:
                lease.landlord_id = lease.unit_id.owner_id
                lease.end_date = lease.start_date + relativedelta(years=1, days=-1)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "/") == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code(
                    "majal.lease") or "/"
        return super().create(vals_list)

    def unlink(self):
        live = self.filtered(lambda lease: lease.state == "active")
        if live:
            raise UserError(
                self.env._(
                    "Terminate these leases before deleting them, otherwise "
                    "their units stay let with nothing letting them: %s",
                    ", ".join(live.mapped("display_name")),
                )
            )
        return super().unlink()

    def _set_unit_status(self, status):
        # sudo, for the same reason as reservations and handovers: the
        # lease is the authority for the unit's occupancy, and a property
        # manager is not necessarily allowed to edit inventory directly.
        for lease in self:
            lease.unit_id.sudo().status = status

    def _release_unit(self):
        for lease in self:
            if lease.unit_id.status == LEASE_HELD_STATUS:
                lease._set_unit_status("vacant")

    def action_generate_rent_schedule(self):
        """Split the annual rent across the instalments the lease actually
        bills in, prorated for a term that is not a whole number of
        periods."""
        for lease in self:
            paid = lease.rent_line_ids.filtered("amount_paid")
            if paid:
                raise UserError(
                    self.env._(
                        "%s already has rent recorded against it. Adjust the "
                        "individual lines instead of regenerating them.",
                        lease.display_name,
                    )
                )
            lease.rent_line_ids.unlink()
            currency = lease.currency_id or self.env.company.currency_id
            months = FREQUENCY_MONTHS[lease.frequency]
            monthly_rent = lease.annual_rent / 12.0

            daily_rent = lease.annual_rent / 365.0

            vals_list = []
            period_start = lease.start_date
            sequence = 0
            while period_start <= lease.end_date:
                full_period_end = period_start + relativedelta(months=months, days=-1)
                if full_period_end <= lease.end_date:
                    period_end = full_period_end
                    amount = monthly_rent * months
                else:
                    # A final stub period is billed for the days it actually
                    # covers, not for a full instalment nobody agreed to.
                    period_end = lease.end_date
                    amount = daily_rent * ((period_end - period_start).days + 1)
                sequence += 1
                vals_list.append({
                    "lease_id": lease.id,
                    "sequence": sequence * 10,
                    "name": self.env._("Rent %(start)s to %(end)s",
                                       start=period_start, end=period_end),
                    "period_start": period_start,
                    "period_end": period_end,
                    "due_date": period_start,
                    "amount": currency.round(amount),
                })
                period_start = period_end + relativedelta(days=1)

            self.env["majal.lease.rent.line"].create(vals_list)
        return True

    def action_activate(self):
        for lease in self:
            if lease.state != "draft":
                raise UserError(self.env._("Only a draft lease can be activated."))
            unit = lease.unit_id
            if unit.status not in LETTABLE_UNIT_STATUSES:
                raise UserError(
                    self.env._(
                        "%(unit)s cannot be let while it is %(status)s.",
                        unit=unit.display_name,
                        status=dict(unit._fields["status"].selection).get(unit.status),
                    )
                )
            if not lease.rent_line_ids:
                raise UserError(
                    self.env._(
                        "Generate the rent schedule for %s before activating it.",
                        lease.display_name,
                    )
                )
            lease.state = "active"
            lease._set_unit_status(LEASE_HELD_STATUS)
        return True

    def action_terminate(self):
        for lease in self:
            if lease.state != "active":
                raise UserError(
                    self.env._("Only an active lease can be terminated."))
            lease._release_unit()
            lease.state = "terminated"
            lease.termination_date = fields.Date.context_today(lease)
        return True

    def action_expire(self):
        for lease in self:
            if lease.state != "active":
                continue
            lease._release_unit()
            lease.state = "expired"
        return True

    def action_cancel(self):
        for lease in self:
            if lease.state == "active":
                raise UserError(
                    self.env._(
                        "Terminate %s rather than cancelling it -- the tenant "
                        "is already in the unit.", lease.display_name))
            lease.state = "cancelled"
        return True

    def action_renew(self):
        """Open a follow-on lease starting the day after this one ends,
        carrying the tenant and terms forward."""
        self.ensure_one()
        if self.state not in ("active", "expired"):
            raise UserError(
                self.env._("Only an active or expired lease can be renewed."))
        new_start = self.end_date + relativedelta(days=1)
        renewal = self.create({
            "unit_id": self.unit_id.id,
            "tenant_id": self.tenant_id.id,
            "landlord_id": self.landlord_id.id,
            "user_id": self.user_id.id,
            "start_date": new_start,
            "end_date": new_start + relativedelta(years=1, days=-1),
            "frequency": self.frequency,
            "annual_rent": self.annual_rent,
            "deposit": self.deposit,
            "renewed_from_id": self.id,
        })
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Renewal"),
            "res_model": "majal.lease",
            "res_id": renewal.id,
            "view_mode": "form",
        }

    @api.model
    def _cron_expire_leases(self):
        lapsed = self.search([
            ("state", "=", "active"),
            ("end_date", "<", fields.Date.context_today(self)),
        ])
        lapsed.action_expire()
        return True
