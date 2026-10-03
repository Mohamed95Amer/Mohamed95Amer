from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionPermit(models.Model):
    """Permit to Work — the authority to start a high-risk activity.

    A permit is a time-boxed authorisation: the precautions were checked, a
    competent person signed it, and it is valid for a stated window on a stated
    location. Two rules make it a control rather than paperwork, and both are
    enforced here rather than left to discipline:

    * a permit cannot be issued until every mandatory precaution is ticked;
    * a permit stops being an authority the moment its window closes, so the
      expiry sweep pulls live permits down instead of letting work continue
      under a lapsed one.
    """

    _name = "construction.permit"
    _description = "Permit to Work"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin", "construction.approvable"]
    _doc_prefix = "PTW"
    _order = "id desc"

    permit_type = fields.Selection(
        [
            ("hot_work", "Hot Work"),
            ("confined_space", "Confined Space Entry"),
            ("height", "Working at Height"),
            ("excavation", "Excavation"),
            ("electrical", "Electrical / Isolation"),
            ("lifting", "Lifting Operation"),
            ("other", "Other High-Risk Work"),
        ],
        required=True,
        default="hot_work",
        tracking=True,
    )
    location = fields.Char(help="Where on site the work is authorised.")
    description = fields.Text(string="Scope of Work")
    contractor_id = fields.Many2one(
        "res.partner", string="Contractor", tracking=True,
        help="Party carrying out the work under this permit.")
    supervisor_id = fields.Many2one(
        "res.users", string="Site Supervisor",
        default=lambda self: self.env.user)
    task_id = fields.Many2one(
        "project.task",
        string="Programme Activity",
        domain="[('project_id', '=', project_id)]",
        help="Activity this permit authorises. Ties the authority to the work "
             "it covers, so a programme can be read for what is permitted to "
             "start rather than only for what is scheduled to.",
    )
    valid_from = fields.Datetime(required=True, default=fields.Datetime.now,
                                 tracking=True)
    valid_to = fields.Datetime(required=True, tracking=True)
    workers_count = fields.Integer(string="Workers Covered", default=1)

    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("submitted", "Awaiting Approval"),
            ("approved", "Approved"),
            ("active", "Live on Site"),
            ("closed", "Closed"),
            ("expired", "Expired"),
            ("suspended", "Suspended"),
            ("rejected", "Rejected"),
        ],
        default="draft",
        tracking=True,
        group_expand="_group_expand_state",
    )
    precaution_ids = fields.One2many(
        "construction.permit.precaution", "permit_id", copy=True)
    precautions_complete = fields.Boolean(compute="_compute_precautions")
    precaution_progress = fields.Float(compute="_compute_precautions")

    approved_by_id = fields.Many2one("res.users", readonly=True, tracking=True)
    approved_date = fields.Datetime(readonly=True)
    closed_by_id = fields.Many2one("res.users", readonly=True)
    closed_date = fields.Datetime(readonly=True)
    close_note = fields.Text(string="Close-out Note")
    suspend_reason = fields.Text()

    is_live = fields.Boolean(compute="_compute_is_live", search="_search_is_live",
                             help="Approved or active and inside its validity window.")

    @api.model
    def _group_expand_state(self, states, domain):
        return [s[0] for s in self._fields["state"].selection]

    @api.depends("precaution_ids.checked", "precaution_ids.mandatory")
    def _compute_precautions(self):
        for permit in self:
            required = permit.precaution_ids.filtered("mandatory")
            permit.precautions_complete = all(required.mapped("checked"))
            total = len(permit.precaution_ids)
            done = len(permit.precaution_ids.filtered("checked"))
            permit.precaution_progress = (done / total * 100) if total else 0.0

    @api.depends("state", "valid_from", "valid_to")
    def _compute_is_live(self):
        now = fields.Datetime.now()
        for permit in self:
            permit.is_live = bool(
                permit.state in ("approved", "active")
                and permit.valid_from and permit.valid_to
                and permit.valid_from <= now <= permit.valid_to
            )

    def _search_is_live(self, operator, value):
        now = fields.Datetime.now()
        domain = [
            ("state", "in", ["approved", "active"]),
            ("valid_from", "<=", now),
            ("valid_to", ">=", now),
        ]
        if (operator == "=" and value) or (operator == "!=" and not value):
            return domain
        return ["!"] + domain

    @api.constrains("valid_from", "valid_to")
    def _check_window(self):
        for permit in self:
            if permit.valid_to <= permit.valid_from:
                raise UserError(
                    self.env._("A permit must expire after it becomes valid.")
                )

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state not in ("closed", "expired", "rejected")

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def action_submit(self):
        for permit in self:
            if permit.state != "draft":
                raise UserError(self.env._("Only a draft permit can be submitted."))
            if not permit.precaution_ids:
                raise UserError(
                    self.env._("List the precautions before requesting approval.")
                )
            permit.state = "submitted"

    def _approval_amount(self):
        """A permit is worth nothing and matters enormously.

        Rules for it therefore match on kind — hot work and confined space need
        the safety manager, everything else the project manager — which is the
        case a value-band engine has to handle without a value.
        """
        self.ensure_one()
        return 0.0

    def _on_approval_granted(self, request):
        """The last signature issues the permit.

        Without this the approval completes and the permit stays submitted,
        which reads as the system having lost it.
        """
        self.filtered(lambda p: p.state == "submitted").write({
            "state": "approved",
            "approved_by_id": request.step_ids[-1:].decided_by_id.id
                              or self.env.user.id,
            "approved_date": fields.Datetime.now(),
        })
        return True

    def action_approve(self):
        for permit in self:
            if permit.state != "submitted":
                raise UserError(
                    self.env._("Only a submitted permit can be approved.")
                )
            if not permit.precautions_complete:
                # The whole point of a permit: no authority without controls.
                raise UserError(self.env._(
                    "Every mandatory precaution must be confirmed before this "
                    "permit can be approved."
                ))
            permit._check_approved()
            permit.write({
                "state": "approved",
                "approved_by_id": self.env.user.id,
                "approved_date": fields.Datetime.now(),
            })

    def action_reject(self):
        self.filtered(lambda p: p.state == "submitted").state = "rejected"

    def action_start_work(self):
        for permit in self:
            if permit.state != "approved":
                raise UserError(
                    self.env._("Work can only start under an approved permit.")
                )
            if not permit.is_live:
                raise UserError(self.env._(
                    "This permit is outside its validity window."
                ))
            permit.state = "active"

    def action_suspend(self):
        self.filtered(lambda p: p.state in ("approved", "active")).state = "suspended"

    def action_resume(self):
        self.filtered(lambda p: p.state == "suspended").state = "approved"

    def action_close(self):
        now = fields.Datetime.now()
        for permit in self.filtered(
                lambda p: p.state in ("approved", "active", "suspended")):
            permit.write({
                "state": "closed",
                "closed_by_id": self.env.user.id,
                "closed_date": now,
            })

    def action_reset(self):
        self.filtered(lambda p: p.state in ("rejected", "expired")).state = "draft"

    @api.model
    def _cron_expire_permits(self):
        """Pull down permits whose window has closed.

        Without this a permit approved last week still reads as authority
        today, which is precisely the failure a permit system exists to
        prevent.
        """
        expired = self.search([
            ("state", "in", ["approved", "active", "suspended"]),
            ("valid_to", "<", fields.Datetime.now()),
        ])
        for permit in expired:
            permit.state = "expired"
            permit.message_post(
                body=self.env._("Permit expired automatically at %s.",
                                permit.valid_to)
            )
        return len(expired)


class ConstructionPermitPrecaution(models.Model):
    _name = "construction.permit.precaution"
    _description = "Permit Precaution"
    _order = "sequence, id"

    permit_id = fields.Many2one(
        "construction.permit", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Precaution", required=True)
    mandatory = fields.Boolean(
        default=True,
        help="Mandatory precautions block approval until they are confirmed.")
    checked = fields.Boolean(string="Confirmed")
    note = fields.Char()
