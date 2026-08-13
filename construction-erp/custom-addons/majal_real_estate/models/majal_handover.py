from odoo import api, fields, models
from odoo.exceptions import UserError

# Handover states that still occupy the unit. A unit can be handed over
# more than once across its life (resale, re-letting), but never twice at
# the same time, so "active" is what the uniqueness rule keys on.
CLOSED_HANDOVER_STATES = ("completed", "cancelled")


class MajalHandover(models.Model):
    """Giving a finished unit to the person who bought it.

    This is the point where a unit stops being inventory and becomes
    somebody's property, so it is deliberately hard to complete by
    accident: the snag list has to be clear and the money has to be in.
    """

    _name = "majal.handover"
    _description = "Unit Handover"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "scheduled_date desc, id desc"

    name = fields.Char(
        string="Reference", required=True, readonly=True, copy=False, default="/")
    unit_id = fields.Many2one(
        "majal.unit", required=True, ondelete="restrict", index=True, tracking=True)
    reservation_id = fields.Many2one(
        "majal.reservation", tracking=True,
        domain="[('unit_id', '=', unit_id)]",
        help="Links the handover to the sale, so the outstanding balance "
             "can be checked before keys change hands.")
    partner_id = fields.Many2one(
        "res.partner", string="Buyer", required=True, tracking=True)

    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True, index=True)
    building_id = fields.Many2one(related="unit_id.building_id", store=True, readonly=True)
    floor_id = fields.Many2one(related="unit_id.floor_id", store=True, readonly=True)
    company_id = fields.Many2one(related="unit_id.company_id", store=True, readonly=True)
    currency_id = fields.Many2one(related="unit_id.currency_id", store=True, readonly=True)

    scheduled_date = fields.Date(tracking=True)
    inspection_date = fields.Date(tracking=True)
    completed_date = fields.Date(readonly=True, copy=False, tracking=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("inspection", "Inspection"),
            ("ready", "Ready for Handover"),
            ("completed", "Completed"),
            ("cancelled", "Cancelled"),
        ],
        default="draft", required=True, tracking=True, copy=False,
    )

    snag_ids = fields.One2many("majal.handover.snag", "handover_id", string="Snag List")
    # Stored so "which handovers are still blocked" is a search, not a
    # scan of every snag in the database.
    snag_count = fields.Integer(compute="_compute_snag_counts", store=True)
    open_snag_count = fields.Integer(compute="_compute_snag_counts", store=True)

    keys_handed = fields.Boolean(tracking=True)
    meter_electricity = fields.Char(string="Electricity Meter Reading")
    meter_water = fields.Char(string="Water Meter Reading")
    amount_residual = fields.Monetary(
        related="reservation_id.amount_residual", readonly=True,
        string="Outstanding Balance")
    notes = fields.Text()

    def init(self):
        # Two live handovers on one unit would each believe they are the
        # one giving it away. Only the database can rule that out under
        # concurrency.
        self.env.cr.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS majal_handover_active_unit_uniq
            ON majal_handover (unit_id)
            WHERE state NOT IN ('completed', 'cancelled')
            """
        )

    @api.depends("snag_ids.state")
    def _compute_snag_counts(self):
        for handover in self:
            handover.snag_count = len(handover.snag_ids)
            handover.open_snag_count = len(
                handover.snag_ids.filtered(lambda s: s.state != "verified"))

    @api.depends("name", "unit_id")
    def _compute_display_name(self):
        for handover in self:
            unit_name = handover.unit_id.name
            handover.display_name = (
                f"{handover.name} - {unit_name}" if unit_name else handover.name)

    @api.onchange("unit_id")
    def _onchange_unit_id(self):
        for handover in self:
            if not handover.unit_id:
                continue
            sale = self.env["majal.reservation"].search(
                [("unit_id", "=", handover.unit_id._origin.id),
                 ("state", "=", "converted")], limit=1)
            if sale:
                handover.reservation_id = sale
                handover.partner_id = sale.partner_id

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "/") == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code(
                    "majal.handover") or "/"
        return super().create(vals_list)

    def unlink(self):
        completed = self.filtered(lambda h: h.state == "completed")
        if completed:
            raise UserError(
                self.env._(
                    "A completed handover is the record that a unit changed "
                    "hands; it cannot be deleted: %s",
                    ", ".join(completed.mapped("display_name")),
                )
            )
        return super().unlink()

    def action_schedule(self):
        for handover in self:
            if handover.state != "draft":
                raise UserError(self.env._("Only a draft handover can be scheduled."))
            if not handover.scheduled_date:
                raise UserError(
                    self.env._("Set a scheduled date before scheduling the handover."))
            handover.state = "scheduled"
        return True

    def action_start_inspection(self):
        for handover in self:
            if handover.state != "scheduled":
                raise UserError(
                    self.env._("Only a scheduled handover can move to inspection."))
            handover.state = "inspection"
            if not handover.inspection_date:
                handover.inspection_date = fields.Date.context_today(handover)
        return True

    def action_mark_ready(self):
        for handover in self:
            if handover.state != "inspection":
                raise UserError(
                    self.env._(
                        "Only a handover under inspection can be marked ready."))
            if handover.open_snag_count:
                raise UserError(
                    self.env._(
                        "%(handover)s still has %(count)s unverified snag(s). "
                        "Every snag must be fixed and verified before the unit "
                        "is ready to hand over.",
                        handover=handover.display_name,
                        count=handover.open_snag_count,
                    )
                )
            handover.state = "ready"
        return True

    def action_complete(self):
        for handover in self:
            if handover.state != "ready":
                raise UserError(
                    self.env._(
                        "%s must be marked ready before it can be completed.",
                        handover.display_name,
                    )
                )
            handover._check_balance_settled()
            handover.state = "completed"
            handover.completed_date = fields.Date.context_today(handover)
            handover.keys_handed = True
            # sudo: the same reasoning as the reservation -- handover is the
            # authority for this status change, and the person running the
            # handover is not necessarily allowed to edit inventory.
            handover.unit_id.sudo().write({
                "status": "handed_over",
                "owner_id": handover.partner_id.id,
            })
        return True

    def _check_balance_settled(self):
        """Keys do not change hands while money is still owed. If there is
        no linked sale there is nothing to check -- the unit may have been
        handed over under an arrangement recorded elsewhere."""
        self.ensure_one()
        if not self.reservation_id:
            return
        currency = self.currency_id or self.env.company.currency_id
        if currency.compare_amounts(self.reservation_id.amount_residual, 0) > 0:
            raise UserError(
                self.env._(
                    "%(buyer)s still owes %(amount)s on %(unit)s. Settle the "
                    "balance before completing the handover.",
                    buyer=self.partner_id.display_name,
                    amount=currency.format(self.reservation_id.amount_residual),
                    unit=self.unit_id.display_name,
                )
            )

    def action_cancel(self):
        for handover in self:
            if handover.state == "completed":
                raise UserError(
                    self.env._("A completed handover cannot be cancelled."))
            handover.state = "cancelled"
        return True

    def action_reset_to_draft(self):
        for handover in self:
            if handover.state != "cancelled":
                raise UserError(
                    self.env._("Only a cancelled handover can be reopened."))
            handover.state = "draft"
        return True


class MajalHandoverSnag(models.Model):
    """A defect found on inspection, blocking handover until it is fixed
    and re-inspected."""

    _name = "majal.handover.snag"
    _description = "Handover Snag"
    _order = "handover_id, sequence, id"

    handover_id = fields.Many2one(
        "majal.handover", required=True, ondelete="cascade", index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Snag", required=True)
    location = fields.Char(help='Where in the unit, e.g. "Master bedroom".')
    severity = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High")],
        default="medium", required=True,
    )
    state = fields.Selection(
        [("open", "Open"), ("fixed", "Fixed"), ("verified", "Verified")],
        default="open", required=True,
    )
    assigned_user_id = fields.Many2one("res.users", string="Assigned To")
    unit_id = fields.Many2one(related="handover_id.unit_id", store=True, readonly=True)
    notes = fields.Text()

    def action_mark_fixed(self):
        self.write({"state": "fixed"})
        return True

    def action_verify(self):
        """Verification is a separate step from fixing on purpose: the
        person who repairs a snag should not be the one who signs it off."""
        for snag in self:
            if snag.state != "fixed":
                raise UserError(
                    self.env._(
                        "%s has not been marked fixed yet, so there is "
                        "nothing to verify.", snag.name))
            snag.state = "verified"
        return True

    def action_reopen(self):
        self.write({"state": "open"})
        return True
