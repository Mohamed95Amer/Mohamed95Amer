from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionTender(models.Model):
    """A tender (bid) package sent out to subcontractors.

    The package is the scope, priced by several bidders against identical
    lines. Holding every bid against the same line list is what makes leveling
    possible at all: comparing bid totals alone hides the two things that
    actually decide an award — a bidder who priced a line at a fraction of the
    others has usually misread the scope, and a bidder who left a line blank
    has not bid the job you asked for.
    """

    _name = "construction.tender"
    _description = "Tender Package"
    _inherit = ["construction.document.mixin", "mail.thread", "mail.activity.mixin"]
    _doc_prefix = "TND"
    _order = "id desc"

    trade = fields.Char(help="e.g. HVAC, Blockwork, Waterproofing.")
    description = fields.Text(string="Scope of Works")
    currency_id = fields.Many2one(
        related="project_id.currency_id", store=True)
    boq_id = fields.Many2one(
        "construction.boq", string="Source BOQ",
        domain="[('project_id', '=', project_id)]",
        help="Bill the package scope was taken from. Its cost lines give the "
             "budget each bid is measured against.")
    closing_date = fields.Datetime(
        tracking=True, help="Deadline for bidders to submit.")

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("issued", "Issued to Bidders"),
            ("leveling", "Leveling"),
            ("awarded", "Awarded"),
            ("cancelled", "Cancelled"),
        ],
        default="draft", tracking=True, group_expand="_group_expand_state",
    )
    line_ids = fields.One2many("construction.tender.line", "tender_id", copy=True)
    bid_ids = fields.One2many("construction.tender.bid", "tender_id")
    # Stored: the dashboard filters and sorts on these, and every input they
    # depend on is declared below, so there is no staleness to trade for it.
    bid_count = fields.Integer(compute="_compute_bid_stats", store=True)
    submitted_bid_count = fields.Integer(compute="_compute_bid_stats", store=True)

    budget_cost = fields.Monetary(
        compute="_compute_budget", store=True, currency_field="currency_id",
        help="Budget for the package, summed from the BOQ cost of its lines.")
    lowest_bid = fields.Monetary(
        compute="_compute_bid_stats", store=True, currency_field="currency_id")
    highest_bid = fields.Monetary(
        compute="_compute_bid_stats", store=True, currency_field="currency_id")
    awarded_bid_id = fields.Many2one(
        "construction.tender.bid", readonly=True, copy=False, tracking=True)
    subcontract_id = fields.Many2one(
        "construction.subcontract", readonly=True, copy=False,
        help="Subcontract created when the package was awarded.")
    award_saving = fields.Monetary(
        compute="_compute_bid_stats", store=True, currency_field="currency_id",
        string="Saving vs Budget",
        help="Budget less the awarded value. Negative means the award is over "
             "budget and the project's committed cost has risen.")

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("line_ids.budget_cost")
    def _compute_budget(self):
        for tender in self:
            tender.budget_cost = sum(tender.line_ids.mapped("budget_cost"))

    @api.depends("bid_ids.state", "bid_ids.amount_total", "awarded_bid_id",
                 "budget_cost")
    def _compute_bid_stats(self):
        for tender in self:
            bids = tender.bid_ids
            priced = bids.filtered(
                lambda b: b.state in ("submitted", "shortlisted", "awarded")
            )
            amounts = priced.mapped("amount_total")
            tender.bid_count = len(bids)
            tender.submitted_bid_count = len(priced)
            tender.lowest_bid = min(amounts) if amounts else 0.0
            tender.highest_bid = max(amounts) if amounts else 0.0
            tender.award_saving = (
                tender.budget_cost - tender.awarded_bid_id.amount_total
                if tender.awarded_bid_id else 0.0
            )

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state in ("draft", "issued", "leveling")

    # ------------------------------------------------------------------
    # Scope
    # ------------------------------------------------------------------
    def action_pull_boq_lines(self):
        """Copy the source BOQ's lines in as the package scope."""
        for tender in self:
            if not tender.boq_id:
                raise UserError(
                    self.env._("Set a source BOQ before pulling its lines in.")
                )
            if tender.state != "draft":
                raise UserError(self.env._(
                    "The scope can only be changed while the package is draft."
                ))
            tender.line_ids.unlink()
            tender.line_ids = [
                (0, 0, {
                    "boq_line_id": line.id,
                    "name": line.name,
                    "quantity": line.quantity,
                    "uom_id": line.uom_id.id,
                    "sequence": index * 10,
                })
                for index, line in enumerate(tender.boq_id.line_ids, start=1)
            ]

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def action_issue(self):
        for tender in self:
            if tender.state != "draft":
                raise UserError(self.env._("Only a draft package can be issued."))
            if not tender.line_ids:
                raise UserError(self.env._(
                    "Add the scope lines bidders must price before issuing."
                ))
            if not tender.bid_ids:
                raise UserError(self.env._("Invite at least one bidder."))
            tender.state = "issued"
            tender.bid_ids.filtered(lambda b: b.state == "draft").state = "invited"

    def action_start_leveling(self):
        for tender in self:
            if tender.state != "issued":
                raise UserError(
                    self.env._("Only an issued package can go to leveling.")
                )
            if not tender.submitted_bid_count:
                raise UserError(self.env._(
                    "No bids have been submitted yet, so there is nothing to "
                    "level."
                ))
            tender.state = "leveling"

    def action_cancel(self):
        self.filtered(lambda t: t.state != "awarded").state = "cancelled"

    def action_reset(self):
        self.filtered(lambda t: t.state == "cancelled").state = "draft"

    def action_view_bids(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Bids"),
            "res_model": "construction.tender.bid",
            "view_mode": "list,form",
            "domain": [("tender_id", "=", self.id)],
            "context": {"default_tender_id": self.id},
        }

    def action_view_subcontract(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.subcontract",
            "res_id": self.subcontract_id.id,
            "view_mode": "form",
        }


class ConstructionTenderLine(models.Model):
    """One scope item every bidder prices, so bids stay comparable."""

    _name = "construction.tender.line"
    _description = "Tender Scope Line"
    _order = "tender_id, sequence, id"

    tender_id = fields.Many2one(
        "construction.tender", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    boq_line_id = fields.Many2one(
        "construction.boq.line", string="BOQ Item",
        help="Cost line this scope item is measured against.")
    name = fields.Char(string="Description", required=True)
    quantity = fields.Float(default=1.0)
    uom_id = fields.Many2one("uom.uom", string="UoM")
    currency_id = fields.Many2one(related="tender_id.currency_id")
    budget_cost = fields.Monetary(
        compute="_compute_budget_cost", store=True, currency_field="currency_id",
        help="Budgeted cost for this quantity, from the linked BOQ line.")

    @api.depends("boq_line_id.unit_cost", "quantity")
    def _compute_budget_cost(self):
        for line in self:
            line.budget_cost = line.quantity * (line.boq_line_id.unit_cost or 0.0)
