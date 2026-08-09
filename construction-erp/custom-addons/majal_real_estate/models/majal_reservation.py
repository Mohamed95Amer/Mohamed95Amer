from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError

# A reservation may only be raised against a unit that is actually
# sellable. "planned" is excluded on purpose: a unit that has not been
# released to sales yet must be released first, so that releasing stays a
# deliberate act rather than a side effect of someone reserving it.
RESERVABLE_UNIT_STATUSES = ("available",)

# The one status that means "this unit is being held by a reservation".
# Releasing a unit only ever moves it out of this status, never out of
# "sold" or anything an operator set by hand.
HELD_UNIT_STATUS = "reserved"


class MajalReservation(models.Model):
    """A hold placed on a single unit for a single buyer.

    The reservation -- not the user -- is what moves a unit between
    available and reserved. A unit can carry at most one confirmed
    reservation at a time, enforced by a partial unique index rather than
    by application logic alone, so a race between two salespeople cannot
    double-book the same unit.
    """

    _name = "majal.reservation"
    _description = "Unit Reservation"
    _inherit = ["mail.thread", "mail.activity.mixin", "portal.mixin"]
    _order = "reservation_date desc, id desc"

    name = fields.Char(
        string="Reference", required=True, readonly=True, copy=False, default="/")
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="restrict", index=True, tracking=True)
    partner_id = fields.Many2one(
        "res.partner", string="Buyer", required=True, tracking=True)
    user_id = fields.Many2one(
        "res.users", string="Salesperson", default=lambda self: self.env.user,
        tracking=True)

    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True, index=True)
    building_id = fields.Many2one(
        related="unit_id.building_id", store=True, readonly=True)
    floor_id = fields.Many2one(related="unit_id.floor_id", store=True, readonly=True)
    company_id = fields.Many2one(related="unit_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="unit_id.currency_id", store=True, readonly=True)

    reservation_date = fields.Date(
        required=True, default=fields.Date.context_today, tracking=True)
    expiry_date = fields.Date(
        required=True, tracking=True,
        default=lambda self: fields.Date.add(fields.Date.context_today(self), days=14),
        help="After this date the hold lapses and the unit returns to the "
             "available pool.")
    # Snapshot, not a related field: the point of a reservation is to pin
    # the price the buyer was quoted, so a later change to the unit's list
    # price must not silently rewrite what was agreed.
    unit_price = fields.Monetary(
        string="List Price at Reservation", readonly=True, copy=False)
    sale_price = fields.Monetary(string="Agreed Price", tracking=True)
    reservation_fee = fields.Monetary(tracking=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("confirmed", "Confirmed"),
            ("converted", "Converted to Sale"),
            ("cancelled", "Cancelled"),
            ("expired", "Expired"),
        ],
        default="draft", required=True, tracking=True, copy=False,
    )
    cancel_reason = fields.Char(copy=False)
    notes = fields.Text()

    lead_id = fields.Many2one("majal.lead", string="Originating Lead", index=True)

    payment_plan_id = fields.Many2one(
        "majal.payment.plan", tracking=True,
        domain="['|', ('development_id', '=', False), "
               "('development_id', '=', development_id)]")
    installment_ids = fields.One2many(
        "majal.payment.installment", "reservation_id", string="Schedule", copy=False)
    amount_scheduled = fields.Monetary(compute="_compute_payment_totals", store=True)
    amount_paid = fields.Monetary(compute="_compute_payment_totals", store=True)
    amount_residual = fields.Monetary(compute="_compute_payment_totals", store=True)
    overdue_count = fields.Integer(compute="_compute_overdue_count")
    next_due_date = fields.Date(compute="_compute_next_due", store=True)

    broker_id = fields.Many2one(
        "res.partner", string="Broker", tracking=True,
        domain="[('is_majal_broker', '=', True)]")
    commission_rate = fields.Float(string="Commission (%)", tracking=True)
    commission_amount = fields.Monetary(compute="_compute_commission_amount", store=True)
    commission_ids = fields.One2many(
        "majal.commission", "reservation_id", string="Commissions")

    def init(self):
        # Application-level checks cannot stop two concurrent transactions
        # from each seeing an available unit and both confirming. Only the
        # database can, so the "one live hold per unit" rule lives here.
        self.env.cr.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS majal_reservation_confirmed_unit_uniq
            ON majal_reservation (unit_id) WHERE state = 'confirmed'
            """
        )

    @api.depends("name", "unit_id")
    def _compute_display_name(self):
        for reservation in self:
            unit_name = reservation.unit_id.name
            reservation.display_name = (
                f"{reservation.name} - {unit_name}" if unit_name else reservation.name)

    def _compute_access_url(self):
        super()._compute_access_url()
        for reservation in self:
            reservation.access_url = f"/my/reservation/{reservation.id}"

    @api.depends("installment_ids.amount", "installment_ids.amount_paid")
    def _compute_payment_totals(self):
        for reservation in self:
            reservation.amount_scheduled = sum(
                reservation.installment_ids.mapped("amount"))
            reservation.amount_paid = sum(
                reservation.installment_ids.mapped("amount_paid"))
            reservation.amount_residual = (
                reservation.amount_scheduled - reservation.amount_paid)

    @api.depends("installment_ids.due_date", "installment_ids.state")
    def _compute_next_due(self):
        for reservation in self:
            unpaid = reservation.installment_ids.filtered(
                lambda i: i.state != "paid").sorted("due_date")
            reservation.next_due_date = unpaid[:1].due_date or False

    def _compute_overdue_count(self):
        for reservation in self:
            reservation.overdue_count = len(
                reservation.installment_ids.filtered("is_overdue"))

    @api.depends("sale_price", "commission_rate")
    def _compute_commission_amount(self):
        for reservation in self:
            reservation.commission_amount = (
                reservation.sale_price * reservation.commission_rate / 100.0)

    @api.constrains("reservation_date", "expiry_date")
    def _check_dates(self):
        for reservation in self:
            if reservation.expiry_date < reservation.reservation_date:
                raise ValidationError(
                    self.env._("A reservation cannot expire before it starts."))

    @api.onchange("unit_id")
    def _onchange_unit_id(self):
        for reservation in self:
            if reservation.unit_id:
                reservation.sale_price = reservation.unit_id.list_price

    @api.onchange("broker_id")
    def _onchange_broker_id(self):
        for reservation in self:
            if reservation.broker_id:
                reservation.commission_rate = (
                    reservation.broker_id.broker_commission_rate)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "/") == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code(
                    "majal.reservation") or "/"
            if not vals.get("unit_price") and vals.get("unit_id"):
                vals["unit_price"] = self.env["majal.unit"].browse(
                    vals["unit_id"]).list_price
        return super().create(vals_list)

    def unlink(self):
        held = self.filtered(lambda r: r.state == "confirmed")
        if held:
            raise UserError(
                self.env._(
                    "Cancel these reservations before deleting them, otherwise "
                    "their units stay held with nothing holding them: %s",
                    ", ".join(held.mapped("display_name")),
                )
            )
        return super().unlink()

    def _set_unit_status(self, status):
        # sudo: units are read-only for the Real Estate User group, but a
        # salesperson confirming their own reservation must still be able
        # to take the unit off the market. The reservation, not the user,
        # is the authority for these two statuses -- so the write goes
        # through here and nowhere else.
        for reservation in self:
            reservation.unit_id.sudo().status = status

    def _release_unit(self):
        """Return each unit to the available pool, but only where this
        reservation is what was holding it -- never override a status an
        operator set by hand, and never resurrect a sold unit."""
        for reservation in self:
            if reservation.unit_id.status == HELD_UNIT_STATUS:
                reservation._set_unit_status("available")

    def action_confirm(self):
        for reservation in self:
            if reservation.state != "draft":
                raise UserError(
                    self.env._("Only a draft reservation can be confirmed."))
            unit = reservation.unit_id
            if unit.status not in RESERVABLE_UNIT_STATUSES:
                raise UserError(
                    self.env._(
                        "%(unit)s is not available (current status: %(status)s), "
                        "so it cannot be reserved.",
                        unit=unit.display_name,
                        status=dict(unit._fields["status"].selection).get(unit.status),
                    )
                )
            conflict = self.search(
                [("unit_id", "=", unit.id), ("state", "=", "confirmed")], limit=1)
            if conflict:
                raise UserError(
                    self.env._(
                        "%(unit)s is already held by %(reservation)s.",
                        unit=unit.display_name,
                        reservation=conflict.display_name,
                    )
                )
            reservation.state = "confirmed"
            reservation._set_unit_status(HELD_UNIT_STATUS)
        return True

    def action_cancel(self):
        for reservation in self:
            if reservation.state in ("converted", "cancelled"):
                raise UserError(
                    self.env._(
                        "%s cannot be cancelled from its current state.",
                        reservation.display_name,
                    )
                )
            reservation._release_unit()
            reservation.state = "cancelled"
        return True

    def action_convert_to_sale(self):
        for reservation in self:
            if reservation.state != "confirmed":
                raise UserError(
                    self.env._(
                        "Only a confirmed reservation can be converted to a sale."))
            reservation.state = "converted"
            reservation._set_unit_status("sold")
            reservation._create_commission()
            if reservation.lead_id and reservation.lead_id.state == "open":
                reservation.lead_id.action_mark_won()
        return True

    def _create_commission(self):
        """Raise the broker's commission at conversion, not at booking --
        a hold that lapses has earned nobody anything."""
        self.ensure_one()
        if not self.broker_id or not self.commission_amount:
            return self.env["majal.commission"]
        existing = self.commission_ids.filtered(
            lambda c: c.broker_id == self.broker_id and c.state != "cancelled")
        if existing:
            return existing
        return self.env["majal.commission"].create({
            "reservation_id": self.id,
            "broker_id": self.broker_id.id,
            "sale_price": self.sale_price,
            "rate": self.commission_rate,
            "amount": self.commission_amount,
        })

    def _installment_due_date(self, plan_line):
        self.ensure_one()
        if plan_line.trigger == "booking":
            return self.reservation_date
        if plan_line.trigger == "days_after":
            return self.reservation_date + relativedelta(days=plan_line.offset_days)
        handover_date = self.development_id.expected_handover_date
        if not handover_date:
            raise UserError(
                self.env._(
                    "%(plan_line)s is due on handover, but %(development)s has no "
                    "expected handover date. Set one before generating the schedule.",
                    plan_line=plan_line.name,
                    development=self.development_id.display_name,
                )
            )
        return handover_date

    def action_generate_schedule(self):
        """Turn the plan's percentages into dated, priced installments.

        Regenerating throws away the existing schedule, so it refuses once
        money has been received against it -- silently deleting a paid
        installment would erase the record of a payment.
        """
        for reservation in self:
            if not reservation.payment_plan_id:
                raise UserError(
                    self.env._("Choose a payment plan before generating a schedule."))
            if not reservation.sale_price:
                raise UserError(
                    self.env._(
                        "Set the agreed price on %s before generating a schedule.",
                        reservation.display_name,
                    )
                )
            paid = reservation.installment_ids.filtered(lambda i: i.amount_paid)
            if paid:
                raise UserError(
                    self.env._(
                        "%s already has payments recorded against its schedule. "
                        "Adjust the individual installments instead of "
                        "regenerating it.",
                        reservation.display_name,
                    )
                )
            reservation.installment_ids.unlink()

            currency = reservation.currency_id or self.env.company.currency_id
            lines = reservation.payment_plan_id.line_ids.sorted(
                lambda line: (line.sequence, line.id))
            vals_list = []
            running_total = 0.0
            for position, plan_line in enumerate(lines):
                amount = currency.round(
                    reservation.sale_price * plan_line.percentage / 100.0)
                if position == len(lines) - 1:
                    # The last milestone absorbs rounding, so the schedule
                    # always adds up to exactly what the buyer agreed to pay
                    # rather than to a few fils either side of it.
                    amount = currency.round(reservation.sale_price - running_total)
                running_total += amount
                vals_list.append({
                    "reservation_id": reservation.id,
                    "sequence": (position + 1) * 10,
                    "name": plan_line.name,
                    "due_date": reservation._installment_due_date(plan_line),
                    "percentage": plan_line.percentage,
                    "amount": amount,
                })
            self.env["majal.payment.installment"].create(vals_list)
        return True

    def action_view_schedule(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Payment Schedule"),
            "res_model": "majal.payment.installment",
            "view_mode": "list,form",
            "domain": [("reservation_id", "=", self.id)],
            "context": {"default_reservation_id": self.id},
        }

    def action_reset_to_draft(self):
        for reservation in self:
            if reservation.state not in ("cancelled", "expired"):
                raise UserError(
                    self.env._(
                        "Only a cancelled or expired reservation can be reopened."))
            reservation.state = "draft"
        return True

    def action_expire(self):
        for reservation in self:
            if reservation.state != "confirmed":
                continue
            reservation._release_unit()
            reservation.state = "expired"
        return True

    @api.model
    def _cron_expire_reservations(self):
        overdue = self.search([
            ("state", "=", "confirmed"),
            ("expiry_date", "<", fields.Date.context_today(self)),
        ])
        overdue.action_expire()
        return True
