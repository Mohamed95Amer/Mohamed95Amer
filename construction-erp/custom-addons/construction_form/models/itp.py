"""Inspection and Test Plans — what must be checked, and what may not proceed.

ISO 9001 and the Saudi Building Code both ask for the plan, not just the
records: which checks a activity requires, at what point, against what
criterion, and who has to be there.

The distinction that matters, and the only one with contractual teeth:

* A **hold point** stops the work. Concrete does not get poured until the
  rebar is signed off, and a pour that goes ahead anyway is the defect
  nobody can inspect afterwards because it is inside the slab.
* A **witness point** invites somebody. If they do not turn up, the work
  proceeds and the record says they were invited.

So the module lets a witness point be released on a note, and refuses to
release a hold point on one. Releasing a hold point needs either the
inspection that evidences it or a written waiver naming who authorised
going ahead — because in practice hold points *are* sometimes waived, and a
system that cannot record that honestly gets worked around instead.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError

POINT_TYPES = [
    ("hold", "Hold Point"),
    ("witness", "Witness Point"),
    ("surveillance", "Surveillance"),
    ("review", "Document Review"),
]

PARTIES = [
    ("contractor", "Contractor"),
    ("consultant", "Consultant / Engineer"),
    ("client", "Client / Employer"),
    ("third_party", "Third-Party / Authority"),
]


class ConstructionItp(models.Model):
    _name = "construction.itp"
    _description = "Inspection and Test Plan"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "ITP"
    _order = "project_id, discipline, id"

    discipline = fields.Selection(
        [("civil", "Civil / Structural"),
         ("architectural", "Architectural"),
         ("mechanical", "Mechanical"),
         ("electrical", "Electrical"),
         ("plumbing", "Plumbing / Drainage"),
         ("infrastructure", "Infrastructure"),
         ("other", "Other")],
        default="civil", required=True, tracking=True)
    activity = fields.Char(
        help="The work this plan governs, e.g. 'Reinforced concrete "
             "substructure'.")
    specification_ref = fields.Char(
        string="Specification Reference",
        help="The clause of the specification this plan implements.")
    revision = fields.Char(default="A", required=True, tracking=True)
    state = fields.Selection(
        [("draft", "Draft"), ("approved", "Approved"),
         ("superseded", "Superseded")],
        default="draft", tracking=True, index=True)
    point_ids = fields.One2many("construction.itp.point", "itp_id")
    point_count = fields.Integer(compute="_compute_counts", store=True)
    hold_point_count = fields.Integer(compute="_compute_counts", store=True)
    notes = fields.Text()

    @api.depends("point_ids", "point_ids.point_type")
    def _compute_counts(self):
        for itp in self:
            itp.point_count = len(itp.point_ids)
            itp.hold_point_count = len(
                itp.point_ids.filtered(lambda p: p.point_type == "hold"))

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state == "approved"

    def action_approve(self):
        for itp in self:
            if itp.state != "draft":
                raise UserError(self.env._(
                    "Only a draft plan can be approved."))
            if not itp.point_ids:
                raise UserError(self.env._(
                    "A plan with no inspection points governs nothing."))
            itp.state = "approved"

    def action_supersede(self):
        self.filtered(lambda i: i.state == "approved").state = "superseded"

    def action_reset_to_draft(self):
        self.filtered(lambda i: i.state != "approved").state = "draft"

    def action_view_records(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Sign-offs — %s", self.reference),
            "res_model": "construction.itp.record",
            "view_mode": "list,form",
            "domain": [("point_id.itp_id", "=", self.id)],
            "context": {"default_itp_id": self.id},
        }


class ConstructionItpPoint(models.Model):
    _name = "construction.itp.point"
    _description = "ITP Inspection Point"
    _order = "itp_id, sequence, id"

    itp_id = fields.Many2one(
        "construction.itp", required=True, ondelete="cascade")
    project_id = fields.Many2one(related="itp_id.project_id", store=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string="Check", required=True)
    stage = fields.Selection(
        [("before", "Before the Work"), ("during", "During the Work"),
         ("after", "On Completion")],
        default="before", required=True)
    point_type = fields.Selection(
        POINT_TYPES, default="witness", required=True,
        help="A hold point stops the work until it is released. A witness "
             "point invites somebody; if they do not attend, work proceeds.")
    responsible_party = fields.Selection(
        PARTIES, default="consultant", required=True,
        string="Verified By")
    acceptance_criteria = fields.Text(
        help="What makes this a pass. A criterion nobody wrote down is a "
             "criterion argued about on site.")
    reference_standard = fields.Char(
        string="Standard / Clause",
        help="e.g. SBC 304, BS EN 12390-3, spec clause 03300.")
    template_id = fields.Many2one(
        "construction.form.template", string="Checklist",
        help="Run this check as a real inspection rather than a signature.")
    record_ids = fields.One2many("construction.itp.record", "point_id")
    record_count = fields.Integer(compute="_compute_record_count")

    def _compute_record_count(self):
        for point in self:
            point.record_count = len(point.record_ids)

    @api.depends("name", "point_type")
    def _compute_display_name(self):
        labels = dict(POINT_TYPES)
        for point in self:
            point.display_name = f"[{labels.get(point.point_type)}] {point.name}"


class ConstructionItpRecord(models.Model):
    """One sign-off: this check, on this pour, on this date, by this person."""

    _name = "construction.itp.record"
    _description = "ITP Sign-Off"
    _inherit = ["mail.thread"]
    _order = "date_required desc, id desc"

    point_id = fields.Many2one(
        "construction.itp.point", required=True, ondelete="restrict",
        tracking=True)
    itp_id = fields.Many2one(related="point_id.itp_id", store=True)
    project_id = fields.Many2one(related="point_id.project_id", store=True,
                                 index=True)
    point_type = fields.Selection(related="point_id.point_type", store=True)
    responsible_party = fields.Selection(
        related="point_id.responsible_party", store=True)
    company_id = fields.Many2one(related="project_id.company_id", store=True)

    location = fields.Char(
        required=True,
        help="What this sign-off covers — the pour, the zone, the run.")
    date_required = fields.Date(
        string="Required By", default=fields.Date.context_today)
    date_signed = fields.Date(readonly=True, tracking=True)
    signed_by_id = fields.Many2one("res.users", readonly=True, tracking=True)

    state = fields.Selection(
        [("pending", "Pending"), ("released", "Released"),
         ("rejected", "Rejected")],
        default="pending", tracking=True, index=True)
    inspection_id = fields.Many2one(
        "construction.form.inspection", string="Evidence",
        help="The completed inspection that evidences this sign-off.")
    waiver_reason = fields.Text(
        string="Waiver",
        help="Where a hold point is released without an inspection, who "
             "authorised proceeding and why.")
    notes = fields.Text()

    is_blocking = fields.Boolean(
        compute="_compute_is_blocking", store=True,
        help="An unreleased hold point. The work it governs must not "
             "proceed.")

    @api.depends("point_type", "state")
    def _compute_is_blocking(self):
        for record in self:
            record.is_blocking = (
                record.point_type == "hold" and record.state == "pending")

    @api.depends("point_id", "location")
    def _compute_display_name(self):
        for record in self:
            record.display_name = " — ".join(
                p for p in (record.point_id.name, record.location) if p)

    # ------------------------------------------------------------------
    # Release
    # ------------------------------------------------------------------
    def action_release(self):
        for record in self:
            if record.state != "pending":
                raise UserError(self.env._(
                    "Only a pending sign-off can be released."))
            # A hold point stops the work, so releasing one has to be
            # evidenced. Waiving it is allowed and recorded: hold points do
            # get waived on real jobs, and a system that cannot say so
            # honestly gets worked around rather than used.
            if record.point_type == "hold" and not (
                    record.inspection_id or record.waiver_reason):
                raise UserError(self.env._(
                    "%(point)s is a hold point. Release it against the "
                    "inspection that evidences it, or record who authorised "
                    "proceeding without one.",
                    point=record.point_id.name))
            if record.inspection_id and \
                    record.inspection_id.state not in ("submitted", "approved"):
                raise UserError(self.env._(
                    "The inspection evidencing %(point)s has not been "
                    "completed yet.", point=record.point_id.name))
            record.write({
                "state": "released",
                "date_signed": fields.Date.context_today(self),
                "signed_by_id": self.env.user.id,
            })
            if record.waiver_reason and not record.inspection_id:
                record.message_post(body=self.env._(
                    "Hold point released without inspection. Authority: %s",
                    record.waiver_reason))

    def action_reject(self):
        for record in self:
            if record.state != "pending":
                raise UserError(self.env._(
                    "Only a pending sign-off can be rejected."))
            record.state = "rejected"

    def action_reopen(self):
        self.filtered(lambda r: r.state != "pending").write({
            "state": "pending", "date_signed": False, "signed_by_id": False,
        })

    def action_view_inspection(self):
        self.ensure_one()
        if not self.inspection_id:
            return False
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.form.inspection",
            "res_id": self.inspection_id.id,
            "view_mode": "form",
            "target": "current",
        }


class ProjectItp(models.Model):
    _inherit = "project.project"

    blocking_hold_point_count = fields.Integer(
        compute="_compute_blocking_hold_points",
        string="Open Hold Points",
        help="Hold points still unreleased. Each one is work that must not "
             "proceed.")

    def _compute_blocking_hold_points(self):
        record = self.env["construction.itp.record"]
        for project in self:
            project.blocking_hold_point_count = record.search_count([
                ("project_id", "=", project.id), ("is_blocking", "=", True)])

    def action_view_hold_points(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Open Hold Points — %s", self.display_name),
            "res_model": "construction.itp.record",
            "view_mode": "list,form",
            "domain": [("project_id", "=", self.id),
                       ("is_blocking", "=", True)],
        }
