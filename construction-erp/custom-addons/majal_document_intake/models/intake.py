"""An upload, what we think it says, and what the user decided about it.

The shape is parse → review → apply, and the order is the whole safety story.
Parsing writes nothing to the target model, so a file that turns out to be
wrong costs nothing to have opened. Applying happens once, from data the user
has already seen and corrected on screen.

Rollback is deliberately "never having applied" rather than an undo. Undoing
an import means deleting records that may already have been submitted,
approved, referenced or signed, and a feature that quietly removes an approved
document is worse than one that made the user look at a preview first. A
rejected upload is marked rejected and creates nothing.
"""

import base64
import hashlib

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

from .parsers import ParseError, parse, parse_pdf_form

# Ceiling on the decoded upload. Overridable per database.
MAX_UPLOAD_MB = 25
MAX_UPLOAD_PARAM = "majal_document_intake.max_upload_mb"

STATES = [
    ("draft", "Uploaded"),
    ("parsed", "Ready to review"),
    ("applied", "Applied"),
    ("rejected", "Rejected"),
]


class MajalIntakeUpload(models.Model):
    _name = "majal.intake.upload"
    _description = "Majal Document Intake"
    _inherit = ["mail.thread"]
    _order = "create_date desc"

    name = fields.Char(compute="_compute_name", store=True)
    file = fields.Binary(required=True, attachment=True)
    filename = fields.Char(required=True)
    checksum = fields.Char(
        readonly=True, index=True, copy=False,
        help="SHA-256 of the bytes as received.",
    )
    file_format = fields.Char(readonly=True)
    state = fields.Selection(STATES, default="draft", required=True, tracking=True)

    company_id = fields.Many2one(
        "res.company", required=True,
        default=lambda self: self.env.company, index=True,
    )
    project_id = fields.Many2one(
        "project.project", index=True,
        domain="[('company_id', 'in', (False, company_id))]",
    )
    target_model = fields.Selection(
        [("majal.document", "Document"), ("majal.sheet", "Sheet"),
         ("construction.form.template", "Fillable form")],
        required=True, default="majal.document",
    )
    profile_id = fields.Many2one(
        "majal.intake.mapping.profile",
        domain="[('target_model', '=', target_model),"
               " ('company_id', '=', company_id)]",
    )
    document_template_id = fields.Many2one(
        "majal.document.template",
        string="Source Template",
        readonly=True,
        copy=False,
        ondelete="set null",
    )

    field_ids = fields.One2many("majal.intake.field", "upload_id")
    row_count = fields.Integer(readonly=True)
    column_count = fields.Integer(readonly=True)
    preview_html = fields.Html(readonly=True, sanitize=True)

    created_record_ref = fields.Char(readonly=True, copy=False)
    duplicate_of_id = fields.Many2one(
        "majal.intake.upload", readonly=True, copy=False,
        help="An earlier upload of a file with the same contents.",
    )
    error = fields.Text(readonly=True, copy=False)

    # Deliberately no unique constraint on the checksum. A duplicate has to be
    # uploadable in order to be *shown* to be a duplicate — refusing it at the
    # database would mean the user gets an integrity error instead of the
    # screen explaining which earlier import it matches. Detection lives in
    # action_parse, where it can also be more precise: only an upload that was
    # actually applied counts, so re-trying a file that was rejected or that
    # failed to parse is not treated as a repeat.

    @api.depends("filename", "create_date")
    def _compute_name(self):
        for upload in self:
            upload.name = upload.filename or _("Upload")

    # ------------------------------------------------------------------
    # Guards
    # ------------------------------------------------------------------
    def _max_upload_bytes(self):
        raw = (
            self.env["ir.config_parameter"].sudo()
            .get_param(MAX_UPLOAD_PARAM, MAX_UPLOAD_MB)
        )
        try:
            megabytes = float(raw)
        except (TypeError, ValueError):
            megabytes = MAX_UPLOAD_MB
        return int(megabytes * 1024 * 1024)

    def _decoded(self):
        self.ensure_one()
        data = base64.b64decode(self.file or b"")
        ceiling = self._max_upload_bytes()
        if len(data) > ceiling:
            raise UserError(_(
                "This file is %(size).1f MB. The limit is %(limit).1f MB.",
                size=len(data) / (1024 * 1024),
                limit=ceiling / (1024 * 1024),
            ))
        return data

    # ------------------------------------------------------------------
    # Parse
    # ------------------------------------------------------------------
    def action_parse(self):
        self.ensure_one()
        if self.state not in ("draft", "parsed"):
            raise UserError(_("This upload has already been decided."))

        data = self._decoded()
        checksum = hashlib.sha256(data).hexdigest()

        # Duplicate detection before parsing: the cheapest check first, and
        # the one whose answer might mean not parsing at all. Checksum is the
        # only signal that is actually evidence — a filename gets reused for a
        # corrected file, so it is recorded but never decides on its own.
        earlier = self.search([
            ("checksum", "=", checksum),
            ("company_id", "=", self.company_id.id),
            ("target_model", "=", self.target_model),
            ("state", "=", "applied"),
            ("id", "!=", self.id),
        ], limit=1)

        if self.target_model == "construction.form.template":
            return self._parse_as_form(data, checksum, earlier)

        try:
            file_format, rows = parse(data, self.filename)
        except ParseError as error:
            # Recorded on the upload and shown in the form's banner rather
            # than raised. A UserError would roll the transaction back at the
            # RPC boundary and take this write with it, so the record of what
            # went wrong would not survive the message describing it — the
            # user would see a modal once and the upload would look untouched
            # afterwards.
            self.write({
                "error": str(error),
                "checksum": checksum,
                "state": "draft",
            })
            return False

        header = rows[0] if rows else []
        body = rows[1:]

        proposals = self.env["majal.intake.matcher"].propose(
            self.target_model, header, self.profile_id or None
        )

        self.field_ids.unlink()
        self.write({
            "checksum": checksum,
            "file_format": file_format,
            "row_count": len(body),
            "column_count": len(header),
            "duplicate_of_id": earlier.id if earlier else False,
            "error": False,
            "state": "parsed",
            "preview_html": self._preview(header, body),
            "field_ids": [
                (0, 0, {
                    "sequence": index * 10,
                    "source_key": proposal["source_key"],
                    "target_field": proposal["target_field"],
                    "confidence": proposal["confidence"],
                    "reason": proposal["reason"],
                    "sample_value": (body[0][index] if body and index < len(body[0])
                                     else ""),
                    "decision": "accept" if proposal["target_field"] else "reject",
                })
                for index, proposal in enumerate(proposals)
            ],
        })
        return True

    def _parse_as_form(self, data, checksum, earlier):
        """Read a PDF's fillable fields and offer them as form questions.

        The same review screen serves this: a detected field, what Majal thinks
        it is, and accept / edit / reject. What changes is the meaning of the
        target — here it is the answer type the question will use, not a field
        on a model — so nothing is written outside construction.form.*.
        """
        try:
            detected = parse_pdf_form(data)
        except ParseError as error:
            self.write({
                "error": str(error), "checksum": checksum, "state": "draft",
            })
            return False

        self.field_ids.unlink()
        self.write({
            "checksum": checksum,
            "file_format": "pdf-form",
            "row_count": len(detected),
            "column_count": len(detected),
            "duplicate_of_id": earlier.id if earlier else False,
            "error": False,
            "state": "parsed",
            "preview_html": self._form_preview(detected),
            "field_ids": [
                (0, 0, {
                    "sequence": index * 10,
                    "source_key": field["name"],
                    "sample_value": field["label"],
                    "target_field": field["answer_type"],
                    # The PDF declared its own type, so this is a read of
                    # structure rather than a guess — except where the answer
                    # type came from a name hint, which is a guess and is
                    # scored lower so a reviewer looks at it.
                    "confidence": 100 if field["answer_type"] in (
                        "text", "yes_no", "signature") else 75,
                    "reason": self.env._("Declared by the PDF as a fillable field."),
                    "required": field["required"],
                    "default_value": field["value"] or False,
                    "decision": "accept",
                })
                for index, field in enumerate(detected)
            ],
        })
        return True

    def _form_preview(self, detected):
        from markupsafe import Markup, escape

        rows = Markup("").join(
            Markup("<tr><td>%s</td><td>%s</td><td>%s</td></tr>") % (
                escape(field["label"]), escape(field["answer_type"]),
                escape(_("Required") if field["required"] else ""),
            )
            for field in detected[:20]
        )
        return Markup(
            "<table class='table table-sm'><thead><tr><th>%s</th><th>%s</th>"
            "<th></th></tr></thead><tbody>%s</tbody></table>"
        ) % (escape(_("Question")), escape(_("Answer type")), rows)

    def _apply_as_form(self):
        """Create the form template, its questions, and keep the source PDF.

        The PDF is attached to the template rather than only to this upload,
        because it is what a completed inspection is written back into. Losing
        it would leave the form usable and the deliverable — the client's own
        document, filled — impossible to produce.
        """
        self.ensure_one()
        accepted = self.field_ids.filtered(lambda f: f.decision == "accept")
        if not accepted:
            raise UserError(_("No field has been accepted."))

        # The same server-side gate the sheet and document paths use. Here
        # target_field is the answer type, and it goes straight into a
        # Selection: an unreviewed value arriving over RPC used to surface as
        # a raw ORM ValueError from deep inside create(), which is neither a
        # readable refusal nor a guarantee that nothing was written.
        self.env["majal.intake.matcher"].check_writable(
            "construction.form.template",
            [line.target_field for line in accepted if line.target_field],
        )

        template = self.env["construction.form.template"].create({
            "name": self.filename.rsplit(".", 1)[0],
            "code": (self.checksum or "")[:8].upper() or "PDFFORM",
            "company_id": self.company_id.id,
            "project_id": self.project_id.id or False,
            "question_ids": [
                (0, 0, {
                    "sequence": line.sequence,
                    "name": line.sample_value or line.source_key,
                    "answer_type": line.target_field or "text",
                    "required": line.required,
                    # The PDF field name, kept so answers can be written back
                    # into the right box. Without it the filled PDF is guesswork.
                    "instructions": line.source_key,
                })
                for line in accepted
            ],
        })
        self.env["ir.attachment"].create({
            "name": self.filename,
            "datas": self.file,
            "res_model": template._name,
            "res_id": template.id,
        })
        if self.document_template_id:
            self.document_template_id.mapped_form_template_id = template
        return template

    def _preview(self, header, body):
        """A small HTML table of what was read. Escaped, never interpolated.

        The values come from an untrusted file, so every cell goes through
        Odoo's escape. The field is sanitize=True as well; that is belt and
        braces on purpose, because this is the one place where file content
        reaches a rendered page.
        """
        from markupsafe import Markup, escape

        rows = body[:5]
        head = Markup("").join(
            Markup("<th>%s</th>") % escape(cell) for cell in header
        )
        lines = Markup("").join(
            Markup("<tr>%s</tr>") % Markup("").join(
                Markup("<td>%s</td>") % escape(cell) for cell in row
            )
            for row in rows
        )
        return Markup(
            "<table class='table table-sm'><thead><tr>%s</tr></thead>"
            "<tbody>%s</tbody></table>"
        ) % (head, lines)

    # ------------------------------------------------------------------
    # Apply
    # ------------------------------------------------------------------
    def action_apply(self):
        self.ensure_one()
        if self.state != "parsed":
            raise UserError(_("Parse and review this upload first."))
        if self.duplicate_of_id:
            raise UserError(_(
                "This file was already imported as %s. Reject it, or delete "
                "the earlier import first.", self.duplicate_of_id.display_name,
            ))

        if self.target_model == "construction.form.template":
            template = self._apply_as_form()
            self.write({
                "state": "applied",
                "created_record_ref": f"construction.form.template,{template.id}",
                "error": False,
            })
            self._message_log(body=_(
                "Built the form %(name)s with %(count)s question(s) from "
                "%(filename)s, SHA-256 %(checksum)s.",
                name=template.name, count=len(template.question_ids),
                filename=self.filename, checksum=self.checksum,
            ))
            return {
                "type": "ir.actions.act_window",
                "res_model": "construction.form.template",
                "res_id": template.id,
                "view_mode": "form",
            }

        accepted = self.field_ids.filtered(
            lambda f: f.decision == "accept" and f.target_field
        )
        if not accepted:
            raise UserError(_("No column has been accepted for import."))

        # Server-side gate. The review screen filters the choices offered, but
        # a decision arriving over RPC has not been through that screen.
        Matcher = self.env["majal.intake.matcher"]
        Matcher.check_writable(self.target_model, accepted.mapped("target_field"))

        missing = self.field_ids.filtered(
            lambda f: f.required and not (f.sample_value or f.default_value)
        )
        if missing:
            raise UserError(_(
                "Required columns are empty: %s",
                ", ".join(missing.mapped("source_key")),
            ))

        values = {}
        for line in accepted:
            values[line.target_field] = line.effective_value()

        values.setdefault("company_id", self.company_id.id)
        if self.project_id:
            values.setdefault("project_id", self.project_id.id)

        target = self.env[self.target_model]
        try:
            record = target.create(values)
        except AccessError:
            # Do not soften this into a warning. The user tried to write a
            # field they may not write, and the honest outcome is a refusal.
            raise
        except (UserError, ValueError) as error:
            self.write({"error": str(error)})
            raise UserError(_(
                "The import could not be applied and nothing was created: %s",
                error,
            ))

        self._attach_original(record)

        self.write({
            "state": "applied",
            "created_record_ref": f"{self.target_model},{record.id}",
            "error": False,
        })
        # _message_log, not message_post, and the same everywhere in this
        # module. These are provenance notes — what was created, from which
        # file, at which checksum — not messages to people, so notifying
        # followers was never the point. It is also the difference between a
        # working import and a broken one: message_post asks mail for the
        # author's address and raises "Unable to send message, please
        # configure the sender's email address" when the posting user's
        # partner has no email. That rolls back the transaction it is meant to
        # be recording, so the record vanishes, the upload stays in review,
        # and the user is told about email configuration. Site users created
        # without an email address are ordinary, and losing their imports to
        # an audit note is not a trade worth making.
        self._message_log(body=_(
            "Applied to %(record)s. Source %(filename)s, SHA-256 "
            "%(checksum)s, %(fields)s field(s) mapped.",
            record=record.display_name,
            filename=self.filename,
            checksum=self.checksum,
            fields=len(accepted),
        ))
        return {
            "type": "ir.actions.act_window",
            "res_model": self.target_model,
            "res_id": record.id,
            "view_mode": "form",
        }

    def _attach_original(self, record):
        """Keep the file that produced the record, attached to the record.

        Without this the provenance is a checksum in a log and the document it
        justifies is somewhere else. Attaching it means anyone reading the
        record can open what it was made from.
        """
        self.ensure_one()
        # No mimetype is passed. ir.attachment._check_contents recomputes it
        # from the filename and forces anything html- or xml-like to
        # text/plain for a user without view-write rights, which is both
        # stronger than a hardcoded octet-stream and maintained by Odoo.
        # Setting it here would be ignored and would read as a guarantee this
        # code does not actually provide.
        self.env["ir.attachment"].create({
            "name": self.filename,
            "datas": self.file,
            "res_model": record._name,
            "res_id": record.id,
        })

    def action_reject(self):
        self.ensure_one()
        if self.state == "applied":
            raise UserError(_(
                "This upload has already created a record. Reversing it means "
                "deleting %s, which is done from that record, not here.",
                self.created_record_ref or _("a record"),
            ))
        self.write({"state": "rejected"})
        self._message_log(body=_("Rejected. Nothing was created."))
        return True

    def action_reset(self):
        self.ensure_one()
        if self.state == "applied":
            raise UserError(_("An applied import cannot be reopened."))
        self.write({"state": "draft", "error": False})
        self.field_ids.unlink()
        return True

    def action_open_record(self):
        self.ensure_one()
        if not self.created_record_ref:
            raise UserError(_("Nothing was created by this upload."))
        model, _sep, record_id = self.created_record_ref.partition(",")
        return {
            "type": "ir.actions.act_window",
            "res_model": model,
            "res_id": int(record_id),
            "view_mode": "form",
        }


class MajalIntakeField(models.Model):
    """One column of the file, and what the user decided to do with it."""

    _name = "majal.intake.field"
    _description = "Majal Intake Field Mapping"
    _order = "sequence, id"

    upload_id = fields.Many2one(
        "majal.intake.upload", required=True, ondelete="cascade", index=True
    )
    company_id = fields.Many2one(
        related="upload_id.company_id", store=True, index=True
    )
    sequence = fields.Integer(default=10)
    source_key = fields.Char(readonly=True)
    sample_value = fields.Char(readonly=True)
    target_field = fields.Char()
    confidence = fields.Integer(readonly=True)
    reason = fields.Char(readonly=True)
    decision = fields.Selection(
        [("accept", "Accept"), ("reject", "Reject")],
        default="reject", required=True,
    )
    override_value = fields.Char(
        help="Use this instead of the value read from the file."
    )
    required = fields.Boolean()
    default_value = fields.Char()

    def effective_value(self):
        """What will actually be written: the edit, the file, or the default."""
        self.ensure_one()
        if self.override_value:
            return self.override_value
        return self.sample_value or self.default_value or ""

    @api.onchange("target_field")
    def _onchange_target_field(self):
        """Tell the user immediately, rather than at apply time.

        The constraint on the mapping profile and the check in action_apply are
        the real gates; this only saves a round trip.
        """
        for line in self:
            if not line.target_field:
                continue
            allowed = self.env[
                line.upload_id.target_model or "majal.document"
            ]._intake_writable_fields()
            if line.target_field not in allowed:
                line.target_field = False
                return {"warning": {
                    "title": _("Field not available"),
                    "message": _(
                        "That field cannot be set by an import. Allowed "
                        "fields: %s", ", ".join(sorted(allowed)),
                    ),
                }}
