from odoo import api, fields, models
from odoo.exceptions import UserError

STATE_BUCKET = {
    "open": "open",
    "in_progress": "in_progress",
    "ready": "in_progress",
    "closed": "done",
    "reopened": "open",
}
STATE_COLOR = {"open": 1, "reopened": 1, "in_progress": 3, "ready": 3, "closed": 10}


class ConstructionDefect(models.Model):
    _name = "construction.defect"
    _description = "Construction Defect / Punch Item"
    _inherit = [
        "construction.document.mixin",
        "mail.thread",
        "mail.activity.mixin",
    ]
    _doc_prefix = "DEF"
    _order = "id desc"

    description = fields.Text()
    location = fields.Char(help="Where on site, e.g. Level 3 lobby, grid C3.")
    trade = fields.Selection(
        [
            ("architectural", "Architectural / Finishes"),
            ("structural", "Structural"),
            ("mep", "MEP"),
            ("civil", "Civil / External"),
            ("other", "Other"),
        ],
        default="architectural",
    )
    severity = fields.Selection(
        [("low", "Low"), ("medium", "Medium"), ("high", "High"),
         ("critical", "Critical")],
        default="medium",
        required=True,
    )
    phase = fields.Selection(
        [("punch", "Pre-Handover Punch"), ("dlp", "Defects Liability Period")],
        default="punch",
        required=True,
        help="Punch = snagging before handover; DLP = warranty defect after "
        "taking-over.",
    )
    state = fields.Selection(
        [
            ("open", "Open"),
            ("in_progress", "In Progress"),
            ("ready", "Ready for Inspection"),
            ("closed", "Closed"),
            ("reopened", "Reopened"),
        ],
        default="open",
        tracking=True,
        group_expand="_group_expand_state",
    )
    responsible_subcontractor_id = fields.Many2one(
        "res.partner", string="Responsible Subcontractor", tracking=True,
        help="Party responsible for rectifying the defect (portal-assignable).")
    assigned_user_id = fields.Many2one(
        "res.users", string="Assigned To", tracking=True)
    photo_before = fields.Image(string="Photo (Defect)", max_width=1920,
                                max_height=1920)
    photo_after = fields.Image(string="Photo (Rectified)", max_width=1920,
                               max_height=1920)
    date_identified = fields.Date(default=fields.Date.context_today)
    pin_ids = fields.One2many("construction.pin", "defect_id")
    pin_count = fields.Integer(compute="_compute_pin_count")
    color = fields.Integer(compute="_compute_color")

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state in ("open", "in_progress", "reopened")

    def _compute_pin_count(self):
        for defect in self:
            defect.pin_count = len(defect.pin_ids)

    @api.depends("state")
    def _compute_color(self):
        for defect in self:
            defect.color = STATE_COLOR.get(defect.state, 0)

    def action_start(self):
        self._require_state(("open", "reopened"))
        self.state = "in_progress"

    def action_ready(self):
        self._require_state(("open", "in_progress", "reopened"))
        self.state = "ready"

    def action_close(self):
        self._require_state(("ready", "in_progress"))
        self.state = "closed"

    def action_reopen(self):
        self._require_state(("closed", "ready"))
        self.state = "reopened"

    def _require_state(self, allowed):
        for defect in self:
            if defect.state not in allowed:
                raise UserError(self.env._(
                    "Cannot perform this action while the defect is '%s'.",
                    dict(self._fields["state"].selection)[defect.state],
                ))

    def status_bucket(self):
        self.ensure_one()
        return STATE_BUCKET.get(self.state, "open")
