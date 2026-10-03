from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionTenderBid(models.Model):
    """One subcontractor's offer against a tender package."""

    _name = "construction.tender.bid"
    _description = "Tender Bid"
    _inherit = ["mail.thread"]
    _order = "amount_total"
    _rec_name = "display_name"

    tender_id = fields.Many2one(
        "construction.tender", required=True, ondelete="cascade", index=True)
    project_id = fields.Many2one(
        related="tender_id.project_id", store=True)
    bidder_id = fields.Many2one(
        "res.partner", string="Bidder", required=True, tracking=True)
    currency_id = fields.Many2one(related="tender_id.currency_id", store=True)
    display_name = fields.Char(compute="_compute_display_name", store=True)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("invited", "Invited"),
            ("submitted", "Submitted"),
            ("shortlisted", "Shortlisted"),
            ("awarded", "Awarded"),
            ("rejected", "Not Successful"),
        ],
        default="draft", tracking=True,
    )
    submitted_on = fields.Datetime(readonly=True, tracking=True)
    is_late = fields.Boolean(
        compute="_compute_is_late", store=True,
        help="Submitted after the package closing date.")
    validity_days = fields.Integer(
        string="Offer Valid (days)", default=90,
        help="How long the bidder holds the price.")
    lead_time_days = fields.Integer(string="Lead Time (days)")
    notes = fields.Text(string="Qualifications")

    line_ids = fields.One2many("construction.tender.bid.line", "bid_id", copy=True)
    amount_total = fields.Monetary(
        compute="_compute_amounts", store=True, currency_field="currency_id")
    variance_vs_budget = fields.Monetary(
        compute="_compute_amounts", store=True, currency_field="currency_id",
        help="Bid total less the package budget. Positive is over budget.")
    unpriced_line_count = fields.Integer(
        compute="_compute_amounts", store=True,
        help="Scope lines this bidder left unpriced — an incomplete bid.")
    is_complete = fields.Boolean(compute="_compute_amounts", store=True)

    _sql_constraints = [
        ("bidder_uniq", "unique(tender_id, bidder_id)",
         "This bidder has already been invited to the package."),
    ]

    @api.depends("bidder_id", "tender_id")
    def _compute_display_name(self):
        for bid in self:
            bid.display_name = (
                f"{bid.bidder_id.name or ''} — {bid.tender_id.name or ''}"
            )

    @api.depends("submitted_on", "tender_id.closing_date")
    def _compute_is_late(self):
        for bid in self:
            closing = bid.tender_id.closing_date
            bid.is_late = bool(
                closing and bid.submitted_on and bid.submitted_on > closing
            )

    @api.depends("line_ids.amount", "line_ids.unit_rate",
                 "tender_id.budget_cost", "tender_id.line_ids")
    def _compute_amounts(self):
        for bid in self:
            bid.amount_total = sum(bid.line_ids.mapped("amount"))
            bid.variance_vs_budget = bid.amount_total - bid.tender_id.budget_cost
            # A line the bidder never priced is not a zero-cost line — it is
            # scope they have not offered to do, which is the difference
            # between the cheapest bid and the one that blows up later.
            priced = bid.line_ids.filtered(lambda l: l.unit_rate)
            bid.unpriced_line_count = len(bid.tender_id.line_ids) - len(priced)
            bid.is_complete = bid.unpriced_line_count <= 0

    def action_load_scope(self):
        """Create a bid line for every scope line the bidder must price."""
        for bid in self:
            existing = bid.line_ids.mapped("tender_line_id")
            missing = bid.tender_id.line_ids - existing
            bid.line_ids = [
                (0, 0, {"tender_line_id": line.id}) for line in missing
            ]

    def action_submit(self):
        for bid in self:
            if bid.state not in ("draft", "invited"):
                raise UserError(
                    self.env._("Only an invited bid can be submitted.")
                )
            if not bid.line_ids:
                raise UserError(self.env._("Price the scope before submitting."))
            bid.write({
                "state": "submitted",
                "submitted_on": fields.Datetime.now(),
            })

    def action_shortlist(self):
        self.filtered(lambda b: b.state == "submitted").state = "shortlisted"

    def action_reject(self):
        self.filtered(
            lambda b: b.state in ("invited", "submitted", "shortlisted")
        ).state = "rejected"

    def action_reset(self):
        self.filtered(lambda b: b.state == "rejected").state = "invited"

    # ------------------------------------------------------------------
    # Award
    # ------------------------------------------------------------------
    def action_award(self):
        """Award the package to this bid and raise the subcontract.

        The award is the moment a price becomes a commitment, so it writes
        straight into a subcontract rather than leaving someone to retype it —
        that subcontract is what the CVR counts as committed cost.
        """
        self.ensure_one()
        tender = self.tender_id
        if self.state not in ("submitted", "shortlisted"):
            raise UserError(
                self.env._("Only a submitted or shortlisted bid can be awarded.")
            )
        if tender.state == "awarded":
            raise UserError(self.env._(
                "%s has already been awarded.", tender.name
            ))
        if tender.state not in ("issued", "leveling"):
            raise UserError(self.env._(
                "The package must be issued or in leveling to award it."
            ))

        subcontract = self.env["construction.subcontract"].create({
            "name": tender.name,
            "project_id": tender.project_id.id,
            "subcontractor_id": self.bidder_id.id,
            "trade": tender.trade,
            "description": tender.description,
            "line_ids": [
                (0, 0, {
                    "boq_line_id": line.tender_line_id.boq_line_id.id,
                    "name": line.name,
                    "quantity": line.quantity,
                    "unit_rate": line.unit_rate,
                    "uom_id": line.tender_line_id.uom_id.id,
                })
                for line in self.line_ids
            ],
        })

        # Confirm it: awarding a package is the commitment, and the CVR only
        # counts non-draft subcontracts. Leaving it draft would mean a package
        # could be awarded without the project's committed cost moving, which
        # is exactly the blind spot the CVR exists to close.
        subcontract.action_confirm()

        self.state = "awarded"
        (tender.bid_ids - self).filtered(
            lambda b: b.state != "rejected"
        ).state = "rejected"
        tender.write({
            "state": "awarded",
            "awarded_bid_id": self.id,
            "subcontract_id": subcontract.id,
        })
        tender.message_post(body=self.env._(
            "Awarded to %(bidder)s for %(amount)s. Subcontract %(sc)s created.",
            bidder=self.bidder_id.name,
            amount=self.amount_total,
            sc=subcontract.name,
        ))
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.subcontract",
            "res_id": subcontract.id,
            "view_mode": "form",
        }


class ConstructionTenderBidLine(models.Model):
    """A bidder's price for one scope line — the unit of comparison."""

    _name = "construction.tender.bid.line"
    _description = "Tender Bid Line"
    _order = "bid_id, sequence, id"

    bid_id = fields.Many2one(
        "construction.tender.bid", required=True, ondelete="cascade")
    tender_line_id = fields.Many2one(
        "construction.tender.line", required=True, ondelete="cascade")
    sequence = fields.Integer(related="tender_line_id.sequence", store=True)
    name = fields.Char(related="tender_line_id.name", string="Description")
    quantity = fields.Float(related="tender_line_id.quantity")
    currency_id = fields.Many2one(related="bid_id.currency_id")
    unit_rate = fields.Monetary(string="Rate")
    amount = fields.Monetary(compute="_compute_amount", store=True)
    budget_cost = fields.Monetary(
        related="tender_line_id.budget_cost", string="Budget")
    variance = fields.Monetary(
        compute="_compute_amount", store=True,
        help="This line's price against its budget. Positive is over budget.")

    _sql_constraints = [
        ("line_uniq", "unique(bid_id, tender_line_id)",
         "This scope line is already priced on the bid."),
    ]

    @api.depends("unit_rate", "quantity", "tender_line_id.budget_cost")
    def _compute_amount(self):
        for line in self:
            line.amount = line.quantity * line.unit_rate
            line.variance = line.amount - line.tender_line_id.budget_cost
