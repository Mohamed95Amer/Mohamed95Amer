from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.exceptions import UserError

DOCUMENT_TYPES = [
    ("title_deed", "Title Deed"),
    ("sale_agreement", "Sale Agreement"),
    ("tenancy_contract", "Tenancy Contract"),
    ("noc", "No-Objection Certificate"),
    ("identity", "Identity Document"),
    ("passport", "Passport"),
    ("visa", "Residence Visa"),
    ("trade_licence", "Trade Licence"),
    ("power_of_attorney", "Power of Attorney"),
    ("insurance", "Insurance Policy"),
    ("other", "Other"),
]


class MajalPropertyDocument(models.Model):
    """A document with a date on it that somebody has to watch.

    Chatter already holds attachments, and that is the right place for a
    photo of a snag. It is the wrong place for a tenancy contract that
    lapses in March or a buyer's visa that expired last week, because
    nothing in an attachment can be searched, filtered or chased. What
    makes this a model rather than a folder is the expiry date.
    """

    _name = "majal.property.document"
    _description = "Property Document"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "expiry_date, id"

    name = fields.Char(required=True, tracking=True)
    document_type = fields.Selection(
        DOCUMENT_TYPES, default="other", required=True, tracking=True)
    reference = fields.Char(help="Number the issuing authority gave it.")
    partner_id = fields.Many2one("res.partner", string="Relates To", tracking=True)
    unit_id = fields.Many2one("majal.unit", ondelete="cascade", index=True)
    development_id = fields.Many2one(
        related="unit_id.development_id", store=True, readonly=True)
    reservation_id = fields.Many2one(
        "majal.reservation", ondelete="cascade", index=True)
    company_id = fields.Many2one(
        "res.company", required=True, default=lambda self: self.env.company)

    issue_date = fields.Date(tracking=True)
    expiry_date = fields.Date(
        tracking=True,
        help="Leave empty for a document that does not lapse, such as a "
             "title deed.")
    reminder_days = fields.Integer(
        default=30, required=True,
        help="How long before expiry this starts appearing as expiring.")
    attachment_ids = fields.Many2many("ir.attachment", string="Files")
    attachment_count = fields.Integer(compute="_compute_attachment_count")
    notes = fields.Text()

    state = fields.Selection(
        [
            ("permanent", "No Expiry"),
            ("valid", "Valid"),
            ("expiring", "Expiring Soon"),
            ("expired", "Expired"),
        ],
        compute="_compute_state", store=True,
    )
    days_to_expiry = fields.Integer(compute="_compute_state", store=True)

    @api.depends("attachment_ids")
    def _compute_attachment_count(self):
        for document in self:
            document.attachment_count = len(document.attachment_ids)

    @api.depends("expiry_date", "reminder_days")
    def _compute_state(self):
        today = fields.Date.context_today(self)
        for document in self:
            if not document.expiry_date:
                document.state = "permanent"
                document.days_to_expiry = 0
                continue
            remaining = (document.expiry_date - today).days
            document.days_to_expiry = remaining
            if remaining < 0:
                document.state = "expired"
            elif remaining <= document.reminder_days:
                document.state = "expiring"
            else:
                document.state = "valid"

    @api.constrains("issue_date", "expiry_date")
    def _check_dates(self):
        for document in self:
            if (document.issue_date and document.expiry_date
                    and document.expiry_date < document.issue_date):
                raise UserError(
                    self.env._("A document cannot expire before it was issued."))

    @api.model
    def _cron_flag_expiring_documents(self):
        """Recompute the state daily and raise an activity on anything that
        has just entered its reminder window.

        The state is stored so it can be searched; a stored compute over a
        date does not move on its own, so something has to nudge it.
        """
        documents = self.search([("expiry_date", "!=", False)])
        documents._compute_state()
        for document in documents.filtered(lambda d: d.state == "expiring"):
            if document.activity_ids:
                continue
            document.activity_schedule(
                "mail.mail_activity_data_todo",
                date_deadline=document.expiry_date,
                summary=self.env._("%s expires soon", document.name),
                user_id=document.create_uid.id,
            )
        return True

    def action_renew(self):
        """Open a copy dated forward a year, which is what renewing one of
        these almost always means."""
        self.ensure_one()
        renewal = self.copy({
            "issue_date": self.expiry_date or fields.Date.context_today(self),
            "expiry_date": (self.expiry_date or fields.Date.context_today(self))
                           + relativedelta(years=1),
            "attachment_ids": [(5, 0, 0)],
        })
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Renewed Document"),
            "res_model": "majal.property.document",
            "res_id": renewal.id,
            "view_mode": "form",
        }
