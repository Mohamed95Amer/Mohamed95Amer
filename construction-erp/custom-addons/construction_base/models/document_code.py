"""Letting a company decide what its document references look like.

Every numbered document gets a reference of the shape PRJ-RFI-0001: the
project code, the document type, the number. The middle part was a Python
class attribute and the number came from an ir.sequence created lazily at
padding 4, so a company that calls its RFIs "queries" and numbers them to six
digits had to either live with somebody else's convention or edit records in
developer mode. Neither is a setting.

What is deliberately *not* configurable here is the sequence the number comes
from. Its code is still derived from the model's own `_doc_prefix`, which
never changes, so changing the visible prefix renames future references
without restarting the count. Keying the sequence on the visible prefix
instead would look tidier and would silently reset every counter to 1 the
first time somebody edited a prefix — which, on a register that has been
running for two years, is not a cosmetic mistake.
"""

import re

from odoo import api, fields, models
from odoo.exceptions import ValidationError

# The reference is read back by people and split on the dash, so a prefix
# that contains one produces references nobody can parse — including us,
# further down, if we ever need to.
PREFIX_PATTERN = re.compile(r"^[A-Za-z0-9]{1,10}$")


class ConstructionDocumentCode(models.Model):
    _name = "construction.document.code"
    _description = "Document Numbering"
    _order = "company_id, name"

    name = fields.Char(
        required=True,
        help="The document type this numbering applies to, as it is named in "
             "the menus.")
    model_name = fields.Char(
        required=True, index=True, readonly=True,
        help="Which register this is. Set when the row is discovered and not "
             "editable afterwards: pointing a numbering row at a different "
             "model would renumber a register that is already running.")
    prefix = fields.Char(
        required=True,
        help="The middle part of the reference — PRJ-RFI-0001. Letters and "
             "digits only, up to ten.")
    padding = fields.Integer(
        default=4, required=True,
        help="How many digits the number is padded to. Raising it is safe; "
             "lowering it below the numbers already issued simply stops "
             "padding them, it does not renumber anything.")
    company_id = fields.Many2one(
        "res.company",
        help="Leave empty for every company. A row naming a company wins over "
             "the blank one for that company.")

    _sql_constraints = [
        ("model_company_uniq", "unique(model_name, company_id)",
         "There is already a numbering rule for this document type."),
    ]

    @api.constrains("prefix")
    def _check_prefix(self):
        for code in self:
            if not PREFIX_PATTERN.match(code.prefix or ""):
                raise ValidationError(self.env._(
                    "“%s” will not work as a prefix. Use up to ten letters or "
                    "digits, with no spaces or dashes: the reference is read "
                    "back by people and split on the dash.", code.prefix))

    @api.constrains("padding")
    def _check_padding(self):
        for code in self:
            if not 1 <= code.padding <= 10:
                raise ValidationError(self.env._(
                    "Padding has to be between 1 and 10 digits."))

    def write(self, vals):
        """Padding is the sequence's business; the prefix is ours.

        The number is formatted by ir.sequence, so padding has to be written
        through to it. The prefix is not: this model puts it into the
        reference itself, and setting ir.sequence.prefix as well would apply
        it twice.
        """
        result = super().write(vals)
        if "padding" in vals:
            for code in self:
                sequence = code._sequence(create=False)
                if sequence:
                    sequence.sudo().padding = code.padding
        return result

    def _sequence(self, create=True):
        """The counter behind this document type, per the module docstring."""
        self.ensure_one()
        model = self.env.get(self.model_name)
        if model is None:
            return self.env["ir.sequence"]
        return self.env["ir.sequence"]._construction_document_sequence(
            getattr(model, "_doc_prefix", "DOC"),
            self.company_id,
            create=create,
        )

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------
    @api.model
    def _sync(self):
        """Make a row for every numbered register that has not got one.

        Driven off the registry rather than a hand-kept list, because the
        list would be wrong within a release: this is a settings screen, and
        a document type missing from it is indistinguishable to the user from
        one that cannot be configured.
        """
        mixin = self.env.registry["construction.document.mixin"]
        existing = set(self.sudo().search(
            [("company_id", "=", False)]).mapped("model_name"))
        rows = []
        for name, model in self.env.registry.models.items():
            # issubclass, not a search through _inherit: Odoo builds each
            # registry entry as a real subclass of everything it inherits, so
            # this catches a register that picks the mixin up two levels down
            # as well as one that names it directly.
            if model._abstract or name in existing:
                continue
            if not issubclass(model, mixin):
                continue
            rows.append({
                "name": self.env[name]._description or name,
                "model_name": name,
                "prefix": getattr(model, "_doc_prefix", "DOC"),
                "padding": 4,
            })
        if rows:
            self.sudo().create(rows)
        return True

    @api.model
    def action_open(self):
        """Opened from the menu, so the screen is never empty on a fresh
        install and picks up registers added by a later module."""
        self._sync()
        return {
            "type": "ir.actions.act_window",
            "name": self.env._("Document Numbering"),
            "res_model": "construction.document.code",
            "view_mode": "list,form",
        }

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------
    @api.model
    def _for(self, model_name, company):
        """The rule that applies, most specific first.

        Two searches rather than one ordered by company_id: NULL ordering is
        the kind of thing that behaves one way here and another way on
        somebody else's Postgres, and getting it wrong means a company-
        specific rule silently loses to the global one.
        """
        Code = self.sudo()
        if company:
            specific = Code.search(
                [("model_name", "=", model_name),
                 ("company_id", "=", company.id)], limit=1)
            if specific:
                return specific
        return Code.search(
            [("model_name", "=", model_name),
             ("company_id", "=", False)], limit=1)


class IrSequence(models.Model):
    _inherit = "ir.sequence"

    @api.model
    def _construction_document_sequence(self, doc_prefix, company, create=True):
        """One place that knows how a document sequence is named.

        It was inline in the mixin, and this model now needs the same answer
        to write padding through. Two copies of a naming convention is how a
        register quietly starts counting from 1 again.
        """
        code = "construction.doc.%s" % doc_prefix.lower()
        sequence = self.search(
            [("code", "=", code),
             ("company_id", "in", [company.id if company else False, False])],
            limit=1)
        if sequence or not create:
            return sequence
        return self.sudo().create({
            "name": "Construction %s" % doc_prefix,
            "code": code,
            "padding": 4,
            "company_id": False,
        })
