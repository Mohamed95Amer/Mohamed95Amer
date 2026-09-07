import hashlib

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

from .transitions import SHEET_TRANSITION


class MajalSheet(models.Model):
    _name = "majal.sheet"
    _description = "Majal Structured Sheet"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "sheet_date desc, id desc"

    reference = fields.Char(
        required=True,
        default=lambda self: _("New"),
        copy=False,
        index=True,
    )
    name = fields.Char(required=True, tracking=True)
    sheet_date = fields.Date(default=fields.Date.context_today, required=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    project_id = fields.Many2one(
        "project.project",
        domain="[('company_id', '=', company_id)]",
        index=True,
    )
    sheet_type = fields.Selection(
        [
            ("boq", "Bill of Quantities"),
            ("estimate", "Estimate"),
            ("budget", "Budget"),
            ("valuation", "Valuation"),
            ("schedule", "Schedule"),
            ("register", "Register"),
        ],
        default="boq",
        required=True,
    )
    currency_id = fields.Many2one(
        "res.currency",
        required=True,
        default=lambda self: self.env.company.currency_id,
    )
    line_ids = fields.One2many(
        "majal.sheet.line",
        "sheet_id",
        copy=True,
    )
    amount_total = fields.Monetary(
        compute="_compute_amount_total",
        store=True,
        currency_field="currency_id",
    )
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("frozen", "Frozen"),
            ("archived", "Archived"),
        ],
        default="draft",
        required=True,
        readonly=True,
        tracking=True,
    )
    revision = fields.Integer(default=0, readonly=True)
    checksum = fields.Char(readonly=True, copy=False)
    frozen_by_id = fields.Many2one("res.users", readonly=True)
    frozen_at = fields.Datetime(readonly=True)
    note = fields.Html(sanitize=True)

    _sql_constraints = [
        (
            "majal_sheet_reference_company_unique",
            "unique(reference, company_id)",
            "Sheet references must be unique per company.",
        )
    ]

    @api.depends("line_ids.amount")
    def _compute_amount_total(self):
        for record in self:
            record.amount_total = sum(record.line_ids.mapped("amount"))

    @api.model_create_multi
    def create(self, vals_list):
        for values in vals_list:
            if values.get("reference", _("New")) == _("New"):
                values["reference"] = (
                    self.env["ir.sequence"].next_by_code("majal.sheet") or _("New")
                )
        return super().create(vals_list)

    # Class attributes for the same reason as majal.document: one definition
    # of what may be written, read by write() and by anything importing into
    # this model, rather than two copies that drift.
    PROTECTED_FIELDS = frozenset({
        "state",
        "revision",
        "checksum",
        "frozen_by_id",
        "frozen_at",
    })
    EDITABLE_FIELDS = frozenset({
        "name",
        "sheet_date",
        "company_id",
        "project_id",
        "sheet_type",
        "currency_id",
        "line_ids",
        "note",
    })

    @api.model
    def _intake_writable_fields(self):
        """What an import may target on a sheet.

        line_ids is excluded even though write() allows it: a one2many takes
        Odoo command tuples, and letting a mapping profile supply those would
        be a way to reach arbitrary nested writes through a field that looks
        like an ordinary target. Sheet lines are imported by their own path.
        """
        return set(self.EDITABLE_FIELDS) - {"line_ids"}

    def write(self, values):
        protected = self.PROTECTED_FIELDS
        if protected.intersection(values) and not (
            self.env.su
            or self.env.context.get("majal_sheet_transition")
            is SHEET_TRANSITION
        ):
            raise AccessError(_("Use the sheet workflow buttons."))
        editable = {
            "name",
            "sheet_date",
            "company_id",
            "project_id",
            "sheet_type",
            "currency_id",
            "line_ids",
            "note",
        }
        if editable.intersection(values) and not self.env.su:
            if any(record.state != "draft" for record in self):
                raise UserError(_("Frozen sheets cannot be edited."))
        return super().write(values)

    def _canonical_content(self):
        self.ensure_one()
        rows = [
            "|".join(
                [
                    str(line.sequence),
                    line.code or "",
                    line.description or "",
                    line.unit or "",
                    str(line.quantity),
                    str(line.unit_rate),
                    str(line.amount),
                ]
            )
            for line in self.line_ids.sorted(lambda item: (item.sequence, item.id))
        ]
        return "\n".join(
            [self.reference, self.name, self.sheet_type, *rows]
        ).encode("utf-8")

    def action_freeze(self):
        for record in self:
            if record.state != "draft":
                raise UserError(_("Only draft sheets can be frozen."))
            checksum = hashlib.sha256(record._canonical_content()).hexdigest()
            record.with_context(majal_sheet_transition=SHEET_TRANSITION).write(
                {
                    "state": "frozen",
                    "revision": record.revision + 1,
                    "checksum": checksum,
                    "frozen_by_id": self.env.user.id,
                    "frozen_at": fields.Datetime.now(),
                }
            )
        return True

    def action_new_revision(self):
        for record in self:
            if record.state != "frozen":
                raise UserError(_("Only a frozen sheet can start a new revision."))
            if (self.env.user.majal_role_id.rank or 0) < 30:
                raise AccessError(_("A manager must reopen a frozen sheet."))
            record.with_context(majal_sheet_transition=SHEET_TRANSITION).write(
                {"state": "draft", "checksum": False}
            )
        return True

    def action_export_csv(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_url",
            "url": "/majal/sheets/%s/export.csv" % self.id,
            "target": "self",
        }


class MajalSheetLine(models.Model):
    _name = "majal.sheet.line"
    _description = "Majal Structured Sheet Line"
    _order = "sheet_id, sequence, id"

    sheet_id = fields.Many2one(
        "majal.sheet",
        required=True,
        ondelete="cascade",
        index=True,
    )
    company_id = fields.Many2one(
        related="sheet_id.company_id",
        store=True,
        readonly=True,
        index=True,
    )
    sequence = fields.Integer(default=10)
    code = fields.Char()
    description = fields.Char(required=True)
    unit = fields.Char()
    quantity = fields.Float(default=1.0, digits=(16, 4))
    unit_rate = fields.Monetary(currency_field="currency_id")
    amount = fields.Monetary(
        compute="_compute_amount",
        store=True,
        currency_field="currency_id",
    )
    currency_id = fields.Many2one(
        related="sheet_id.currency_id",
        store=True,
        readonly=True,
    )
    note = fields.Char()

    @api.depends("quantity", "unit_rate")
    def _compute_amount(self):
        for line in self:
            line.amount = line.quantity * line.unit_rate

    @api.model_create_multi
    def create(self, vals_list):
        sheets = self.env["majal.sheet"].browse(
            [values.get("sheet_id") for values in vals_list if values.get("sheet_id")]
        )
        if not self.env.su and any(sheet.state != "draft" for sheet in sheets):
            raise UserError(_("Frozen sheets cannot receive new lines."))
        return super().create(vals_list)

    def write(self, values):
        if not self.env.su and any(line.sheet_id.state != "draft" for line in self):
            raise UserError(_("Frozen sheet lines cannot be changed."))
        return super().write(values)

    def unlink(self):
        if not self.env.su and any(line.sheet_id.state != "draft" for line in self):
            raise UserError(_("Frozen sheet lines cannot be deleted."))
        return super().unlink()
