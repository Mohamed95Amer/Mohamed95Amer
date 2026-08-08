"""Proof that a drawing was issued, to whom, and for what.

ISO 19650 asks for the exchange record, and the contractual question behind it
is harder: when a claim turns on whether the contractor was working to Rev. B
or Rev. C, "we emailed it" is not an answer and a mailbox is not a register.

A transmittal is the cover note. It fixes four things at the moment of issue —
which revisions, to whom, for what purpose, on what date — and then records
whether the other side acknowledged. Once issued it stops being editable,
because a record that can be revised after the fact proves nothing.
"""

from odoo import api, fields, models
from odoo.exceptions import UserError


class ConstructionTransmittal(models.Model):
    _name = "construction.transmittal"
    _description = "Drawing Transmittal"
    _inherit = ["construction.document.mixin", "mail.thread",
                "mail.activity.mixin"]
    _doc_prefix = "TRN"
    _order = "project_id, date_issued desc, id desc"

    name = fields.Char(default=lambda self: self.env._("Transmittal"))
    recipient_id = fields.Many2one(
        "res.partner", string="Issued To", required=True, tracking=True)
    recipient_attention = fields.Char(
        string="For the Attention Of",
        help="The individual at the recipient, where the contract names one.")
    purpose = fields.Selection(
        [("tender", "For Tender"),
         ("approval", "For Approval"),
         ("construction", "For Construction"),
         ("information", "For Information"),
         ("asbuilt", "As-Built Record")],
        default="construction", required=True, tracking=True,
        help="What the recipient is being asked to do with these drawings. "
             "The contractual weight of an issue depends on it.")
    method = fields.Selection(
        [("email", "Email"), ("portal", "Portal"), ("hand", "By Hand"),
         ("courier", "Courier"), ("post", "Post")],
        default="email", required=True)
    date_issued = fields.Date(
        string="Issued On", default=fields.Date.context_today,
        required=True, tracking=True)
    notes = fields.Text()

    revision_ids = fields.Many2many(
        "construction.drawing.revision", string="Drawings Issued",
        domain="[('project_id', '=', project_id)]")
    revision_count = fields.Integer(
        compute="_compute_revision_count", store=True)

    state = fields.Selection(
        [("draft", "Draft"), ("issued", "Issued"),
         ("acknowledged", "Acknowledged"), ("cancelled", "Cancelled")],
        default="draft", tracking=True, index=True)
    date_acknowledged = fields.Date(readonly=True, tracking=True)
    acknowledged_by = fields.Char(
        readonly=True, tracking=True,
        help="Who at the recipient confirmed receipt.")

    # Stored so the register can filter on it: "which of my issues have gone
    # stale" is the question this whole model exists to answer, and it must
    # be askable across every project at once.
    superseded_count = fields.Integer(
        compute="_compute_superseded", store=True, string="Superseded Since",
        help="Revisions on this transmittal that are no longer current. The "
             "recipient is working to something out of date unless a later "
             "transmittal reached them.")

    @api.depends("revision_ids")
    def _compute_revision_count(self):
        for transmittal in self:
            transmittal.revision_count = len(transmittal.revision_ids)

    @api.depends("revision_ids.state")
    def _compute_superseded(self):
        for transmittal in self:
            transmittal.superseded_count = len(
                transmittal.revision_ids.filtered(
                    lambda r: r.state == "superseded"))

    def _is_open_for_overdue(self):
        self.ensure_one()
        return self.state == "issued"

    # ------------------------------------------------------------------
    # Immutability
    # ------------------------------------------------------------------
    # What was issued, to whom, for what and when. A transmittal exists to be
    # evidence, and evidence that can be edited afterwards is not evidence.
    _LOCKED_FIELDS = {
        "revision_ids", "recipient_id", "purpose", "date_issued",
        "recipient_attention", "method", "project_id",
    }

    def write(self, values):
        locked = self._LOCKED_FIELDS & set(values)
        if locked:
            frozen = self.filtered(
                lambda t: t.state in ("issued", "acknowledged"))
            if frozen:
                raise UserError(self.env._(
                    "%(doc)s has already been issued. What was sent, to whom "
                    "and when cannot be changed afterwards — cancel it and "
                    "raise a new transmittal.",
                    doc=frozen[0].display_name))
        return super().write(values)

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------
    def action_issue(self):
        for transmittal in self:
            if transmittal.state != "draft":
                raise UserError(self.env._(
                    "Only a draft transmittal can be issued."))
            if not transmittal.revision_ids:
                raise UserError(self.env._(
                    "A transmittal with no drawings on it records nothing."))
            transmittal.state = "issued"
            transmittal.message_post(body=self.env._(
                "Issued to %(who)s %(how)s — %(count)s drawing(s) %(purpose)s.",
                who=transmittal.recipient_id.display_name,
                how=dict(transmittal._fields["method"].selection).get(
                    transmittal.method),
                count=len(transmittal.revision_ids),
                purpose=dict(transmittal._fields["purpose"].selection).get(
                    transmittal.purpose)))

    def action_acknowledge(self, acknowledged_by=None):
        for transmittal in self:
            if transmittal.state != "issued":
                raise UserError(self.env._(
                    "Only an issued transmittal can be acknowledged."))
            transmittal.write({
                "state": "acknowledged",
                "date_acknowledged": fields.Date.context_today(self),
                "acknowledged_by": (
                    acknowledged_by
                    or transmittal.recipient_id.display_name),
            })

    def action_cancel(self):
        for transmittal in self:
            if transmittal.state == "acknowledged":
                raise UserError(self.env._(
                    "The recipient has confirmed receipt. Cancelling would "
                    "delete the acknowledgement — issue a superseding "
                    "transmittal instead."))
            transmittal.state = "cancelled"

    def action_reset_to_draft(self):
        self.filtered(lambda t: t.state == "cancelled").state = "draft"

    def action_view_revisions(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Drawings — %s", self.reference),
            "res_model": "construction.drawing.revision",
            "view_mode": "list,form",
            "domain": [("id", "in", self.revision_ids.ids)],
        }


class ConstructionDrawingRevisionTransmittal(models.Model):
    """The reverse: has this revision actually been sent to anybody?

    A drawing marked "current" that was never issued is the quiet failure
    this register exists to catch — the office is building to a revision the
    site has never seen.
    """

    _inherit = "construction.drawing.revision"

    transmittal_ids = fields.Many2many(
        "construction.transmittal", string="Transmittals")
    # Deliberately two compute methods rather than one. A stored and a
    # non-stored field cannot share a compute: Odoo warns that reading the
    # non-stored one recomputes and *writes* the stored one, and the write
    # lands mid-create with the record half-built. It corrupted the
    # revision's own state field before this was split.
    transmittal_count = fields.Integer(compute="_compute_transmittal_count")
    is_issued = fields.Boolean(
        compute="_compute_is_issued", store=True,
        string="Issued", help="Sent to somebody on a transmittal.")

    def _live_transmittals(self):
        self.ensure_one()
        return self.transmittal_ids.filtered(
            lambda t: t.state in ("issued", "acknowledged"))

    @api.depends("transmittal_ids", "transmittal_ids.state")
    def _compute_transmittal_count(self):
        for revision in self:
            revision.transmittal_count = len(revision._live_transmittals())

    @api.depends("transmittal_ids", "transmittal_ids.state")
    def _compute_is_issued(self):
        for revision in self:
            revision.is_issued = bool(revision._live_transmittals())

    def action_view_transmittals(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Transmittals — %s", self.display_name),
            "res_model": "construction.transmittal",
            "view_mode": "list,form",
            "domain": [("revision_ids", "in", self.id)],
        }
