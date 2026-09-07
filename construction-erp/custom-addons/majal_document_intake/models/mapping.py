"""Proposing a target field for a column, and saying how sure we are.

Every signal here is deterministic and local: an exact label match, a
normalised match, a known alias, or a type that fits. No model is consulted
and nothing leaves the server. A confidence is therefore a statement about
which rule fired, not a guess dressed as a number — and the review screen
tells the user which rule it was, so the figure can be argued with.

Aliases are bilingual because the files are. A column headed "الموضوع" and one
headed "Subject" mean the same thing, and a mapping that only knows the
English is a mapping that does nothing useful on half of this customer's
documents.
"""

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError

from .parsers import normalise_label

# Confidence bands. Deliberately coarse: a spread of values implying precision
# the rules do not have would invite people to trust the number instead of
# reading the sample value next to it.
EXACT = 100
ALIAS = 90
NORMALISED = 75
PARTIAL = 50
NONE = 0

CONFIDENCE_REASONS = {
    EXACT: "The column name is the field name.",
    ALIAS: "A known alias for this field.",
    NORMALISED: "Matches once punctuation, case and Arabic spelling are folded.",
    PARTIAL: "The column name contains the field name, or the reverse.",
    NONE: "No rule matched. Choose a field or reject the column.",
}

# Bilingual aliases, keyed by target field. Values are normalised on load, so
# they may be written here as a human would type them.
ALIASES = {
    "majal.document": {
        "name": ["subject", "title", "document name", "الموضوع", "العنوان", "اسم المستند"],
        "document_date": ["date", "issued", "document date", "التاريخ", "تاريخ المستند"],
        "reference": ["ref", "reference", "doc no", "number", "المرجع", "الرقم"],
        "recipient_id": ["to", "recipient", "addressee", "المرسل اليه", "الجهة"],
        "project_id": ["project", "job", "المشروع"],
        "language": ["language", "lang", "اللغة"],
        "body_html": ["body", "content", "text", "المحتوى", "النص"],
    },
    "majal.sheet": {
        "name": ["subject", "title", "sheet name", "العنوان", "اسم الكشف"],
        "sheet_date": ["date", "sheet date", "التاريخ"],
        "reference": ["ref", "reference", "number", "المرجع", "الرقم"],
        "project_id": ["project", "job", "المشروع"],
        "sheet_type": ["type", "kind", "النوع"],
        "currency_id": ["currency", "ccy", "العملة"],
    },
}


class MajalIntakeMappingProfile(models.Model):
    """A saved set of column-to-field rules, reusable across uploads."""

    _name = "majal.intake.mapping.profile"
    _description = "Majal Intake Mapping Profile"
    _order = "name"

    name = fields.Char(required=True, translate=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
        index=True,
    )
    target_model = fields.Selection(
        [("majal.document", "Document"), ("majal.sheet", "Sheet")],
        required=True,
        default="majal.document",
        help="Imports may only target these. Other registers have their own "
             "importers and their own approvals.",
    )
    document_type = fields.Selection(
        [
            ("letter", "Letter"),
            ("contract", "Contract"),
            ("quotation", "Quotation"),
            ("submittal", "Submittal"),
            ("rfi", "RFI"),
            ("inspection", "Inspection"),
            ("handover", "Handover"),
            ("other", "Other"),
        ],
        help="Optional. Narrows which profile is offered for an upload.",
    )
    line_ids = fields.One2many(
        "majal.intake.mapping.line", "profile_id", copy=True
    )
    note = fields.Char()

    def _rules(self):
        """{normalised source key: line} for this profile."""
        self.ensure_one()
        return {normalise_label(line.source_key): line for line in self.line_ids}


class MajalIntakeMappingLine(models.Model):
    _name = "majal.intake.mapping.line"
    _description = "Majal Intake Mapping Rule"
    _order = "sequence, id"

    profile_id = fields.Many2one(
        "majal.intake.mapping.profile", required=True, ondelete="cascade",
        index=True,
    )
    company_id = fields.Many2one(
        related="profile_id.company_id", store=True, index=True
    )
    sequence = fields.Integer(default=10)
    source_key = fields.Char(required=True, help="The column label in the file.")
    target_field = fields.Char(required=True)
    required = fields.Boolean(
        help="Refuse the import if this column is absent or empty."
    )
    default_value = fields.Char(
        help="Used when the column is present but the cell is empty."
    )

    @api.constrains("target_field", "profile_id")
    def _check_target_is_allowed(self):
        """The allowlist, enforced where it cannot be bypassed.

        A profile is ordinary data: any user who can reach the form can set
        target_field to whatever they like, and a check that lives only in the
        UI is not a check. So it is a constraint, and it asks the target model
        itself which fields an import may write rather than keeping a list
        here that would drift away from the model's own guards.
        """
        for line in self:
            model_name = line.profile_id.target_model
            allowed = self.env[model_name]._intake_writable_fields()
            if line.target_field not in allowed:
                raise ValidationError(_(
                    "%(field)s cannot be set by an import on %(model)s. "
                    "Allowed fields are: %(allowed)s",
                    field=line.target_field,
                    model=model_name,
                    allowed=", ".join(sorted(allowed)) or _("none"),
                ))


class MajalIntakeMatcher(models.AbstractModel):
    """Proposes target fields for the columns found in a file."""

    _name = "majal.intake.matcher"
    _description = "Majal Intake Field Matcher"

    @api.model
    def _alias_index(self, model_name):
        index = {}
        for target, aliases in ALIASES.get(model_name, {}).items():
            for alias in aliases:
                index[normalise_label(alias)] = target
        return index

    @api.model
    def _label_index(self, model_name):
        """{normalised field label: field name} in the user's language.

        Field strings are translated, so an Arabic user's column headed
        "المشروع" should match the field whose label reads "المشروع" without
        anyone writing that alias by hand.
        """
        index = {}
        allowed = self.env[model_name]._intake_writable_fields()
        for name, field in self.env[model_name]._fields.items():
            if name not in allowed:
                continue
            index[normalise_label(field.string)] = name
        return index

    @api.model
    def propose(self, model_name, columns, profile=None):
        """Return [{source_key, target_field, confidence, reason}] per column.

        A saved profile always wins: somebody decided it, and second-guessing
        a decision with a heuristic is how an import surprises the person who
        set it up.
        """
        allowed = self.env[model_name]._intake_writable_fields()
        aliases = self._alias_index(model_name)
        labels = self._label_index(model_name)
        rules = profile._rules() if profile else {}

        proposals = []
        for column in columns:
            key = normalise_label(column)
            target, confidence = None, NONE

            if key in rules:
                target, confidence = rules[key].target_field, EXACT
            elif column in allowed:
                target, confidence = column, EXACT
            elif key in aliases:
                target, confidence = aliases[key], ALIAS
            elif key in labels:
                target, confidence = labels[key], NORMALISED
            elif key:
                for candidate in sorted(allowed):
                    normalised = normalise_label(candidate)
                    if normalised and (
                        normalised in key or key in normalised
                    ):
                        target, confidence = candidate, PARTIAL
                        break

            # A rule may name a field that was allowed when the profile was
            # written and is not now. Refuse it here rather than at write time.
            if target and target not in allowed:
                target, confidence = None, NONE

            proposals.append({
                "source_key": column,
                "target_field": target or False,
                "confidence": confidence,
                "reason": CONFIDENCE_REASONS[confidence],
            })
        return proposals

    @api.model
    def check_writable(self, model_name, field_names):
        """Last gate before a write. Raises rather than filtering silently."""
        allowed = self.env[model_name]._intake_writable_fields()
        forbidden = sorted(set(field_names) - allowed)
        if forbidden:
            raise UserError(_(
                "These fields cannot be written by an import: %s",
                ", ".join(forbidden),
            ))
