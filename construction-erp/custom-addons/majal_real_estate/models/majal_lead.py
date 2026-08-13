from odoo import api, fields, models
from odoo.exceptions import UserError


class MajalLeadStage(models.Model):
    _name = "majal.lead.stage"
    _description = "Lead Stage"
    _order = "sequence, id"

    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    fold = fields.Boolean(
        help="Collapse this column in the pipeline when it has no leads.")
    is_won = fields.Boolean(
        string="Is Won Stage",
        help="Leads reaching this stage count as converted enquiries.")


class MajalLead(models.Model):
    """An enquiry about buying, before there is a unit to hold.

    Deliberately its own model rather than a dependency on crm: the
    property module stays installable on its own, and a real-estate
    enquiry carries fields (development, budget, unit type wanted) that a
    generic lead does not.
    """

    _name = "majal.lead"
    _description = "Sales Lead"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "priority desc, id desc"
    _rec_name = "name"

    name = fields.Char(string="Enquiry", required=True, tracking=True)
    active = fields.Boolean(default=True)
    partner_id = fields.Many2one("res.partner", string="Contact", tracking=True)
    contact_name = fields.Char()
    email = fields.Char()
    phone = fields.Char()

    stage_id = fields.Many2one(
        "majal.lead.stage", required=True, group_expand="_group_expand_stage_ids",
        default=lambda self: self.env["majal.lead.stage"].search([], limit=1),
        tracking=True,
    )
    state = fields.Selection(
        [("open", "Open"), ("won", "Won"), ("lost", "Lost")],
        default="open", required=True, tracking=True,
    )
    priority = fields.Selection(
        [("0", "Low"), ("1", "Medium"), ("2", "High")], default="0")
    user_id = fields.Many2one(
        "res.users", string="Salesperson", default=lambda self: self.env.user,
        tracking=True)

    development_id = fields.Many2one("majal.development", tracking=True)
    unit_type_id = fields.Many2one(
        "majal.unit.type", string="Interested In",
        domain="[('development_id', '=', development_id)]")
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(
        "res.currency", related="company_id.currency_id", readonly=True)
    budget = fields.Monetary()
    source = fields.Char(help='Where the enquiry came from, e.g. "Website", "Walk-in".')
    expected_close_date = fields.Date()
    lost_reason = fields.Char()
    notes = fields.Text()

    reservation_ids = fields.One2many("majal.reservation", "lead_id", string="Reservations")
    reservation_count = fields.Integer(compute="_compute_reservation_count")

    @api.model
    def _group_expand_stage_ids(self, stages, domain):
        # Show every stage as a pipeline column, including the empty ones,
        # so a salesperson can drag a lead into a stage nobody is in yet.
        return stages.search([], order="sequence, id")

    @api.depends("reservation_ids")
    def _compute_reservation_count(self):
        for lead in self:
            lead.reservation_count = len(lead.reservation_ids)

    @api.onchange("partner_id")
    def _onchange_partner_id(self):
        for lead in self:
            if lead.partner_id:
                lead.contact_name = lead.partner_id.name
                lead.email = lead.partner_id.email
                lead.phone = lead.partner_id.phone

    def action_mark_won(self):
        won_stage = self.env["majal.lead.stage"].search([("is_won", "=", True)], limit=1)
        for lead in self:
            lead.state = "won"
            if won_stage:
                lead.stage_id = won_stage
        return True

    def action_mark_lost(self):
        for lead in self:
            lead.state = "lost"
        return True

    def action_reopen(self):
        for lead in self:
            lead.state = "open"
            lead.lost_reason = False
        return True

    def action_create_reservation(self):
        """Hand the enquiry over to the reservation flow.

        The buyer has to be a real contact by this point -- a reservation
        names who is holding the unit, and "someone who emailed us" is not
        a party you can hold inventory for.
        """
        self.ensure_one()
        if not self.partner_id:
            raise UserError(
                self.env._(
                    "Set a contact on %s before reserving a unit for them.",
                    self.display_name,
                )
            )
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("New Reservation"),
            "res_model": "majal.reservation",
            "view_mode": "form",
            "target": "current",
            "context": {
                "default_lead_id": self.id,
                "default_partner_id": self.partner_id.id,
                "default_user_id": self.user_id.id,
                "default_development_id": self.development_id.id,
            },
        }

    def action_view_reservations(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Reservations"),
            "res_model": "majal.reservation",
            "view_mode": "list,form",
            "domain": [("lead_id", "=", self.id)],
            "context": {"default_lead_id": self.id},
        }
