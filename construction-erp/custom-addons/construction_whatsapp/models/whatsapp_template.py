from odoo import api, fields, models
from odoo.exceptions import UserError


class WhatsappTemplate(models.Model):
    """A message template as Meta approved it.

    WhatsApp does not allow free text to someone who has not messaged you in
    the last 24 hours — the first contact has to be a template that Meta has
    reviewed. Templates carry positional placeholders ({{1}}, {{2}}...), so
    what is stored here is the ordered list of fields that fill them.

    The parameters are field paths, resolved by walking relations, never
    evaluated as code. A notification template is exactly the kind of record an
    integrator edits without thinking about it, and an eval here would turn
    that into remote code execution.
    """

    _name = "whatsapp.template"
    _description = "WhatsApp Message Template"
    _order = "name"

    name = fields.Char(required=True, help="What this template is for, in your words.")
    active = fields.Boolean(default=True)
    template_name = fields.Char(
        required=True,
        help="The exact template name registered with Meta. Case sensitive.",
    )
    lang_code = fields.Char(
        string="Language", default="en", required=True,
        help="Language tag of the approved template, e.g. en or en_US.",
    )
    category = fields.Selection(
        [("utility", "Utility"), ("marketing", "Marketing"),
         ("authentication", "Authentication")],
        default="utility", required=True,
        help="Meta bills by category. Operational alerts are utility, which "
             "is the cheapest; a reply within 24 hours is free.",
    )
    model_id = fields.Many2one(
        "ir.model", string="Applies To", ondelete="cascade",
        help="Model the parameters are read from.",
    )
    model = fields.Char(related="model_id.model", store=True, readonly=True)
    body_params = fields.Char(
        string="Parameters",
        help="Comma-separated field paths filling {{1}}, {{2}}... in order. "
             "Relations are followed with dots, e.g. "
             "reference, project_id.name, date_required",
    )
    preview = fields.Text(
        compute="_compute_preview",
        help="What the parameters resolve to on the most recent record.",
    )

    _sql_constraints = [
        ("template_lang_uniq", "unique(template_name, lang_code)",
         "That template and language pair already exists."),
    ]

    @api.depends("body_params", "model")
    def _compute_preview(self):
        for template in self:
            if not template.model or not template.body_params:
                template.preview = False
                continue
            record = self.env[template.model].search([], limit=1)
            if not record:
                template.preview = self.env._("No record to preview against.")
                continue
            try:
                values = template._resolve_params(record)
            except UserError as err:
                template.preview = str(err)
                continue
            template.preview = "\n".join(
                f"{{{{{index + 1}}}}} → {value}"
                for index, value in enumerate(values)
            )

    def _param_paths(self):
        self.ensure_one()
        return [p.strip() for p in (self.body_params or "").split(",") if p.strip()]

    def _resolve_params(self, record):
        """Walk each field path on the record and render it as text."""
        self.ensure_one()
        record.ensure_one()
        values = []
        for path in self._param_paths():
            current = record
            for part in path.split("."):
                if current and part not in current._fields:
                    raise UserError(self.env._(
                        "Template %(template)s asks for %(path)s, but "
                        "%(model)s has no field %(field)s.",
                        template=self.name, path=path,
                        model=current._name, field=part,
                    ))
                current = current[part] if current else current
                if hasattr(current, "_name") and len(current) > 1:
                    # A one2many in the middle of a path has no single value;
                    # taking the first would be a silent, arbitrary choice.
                    raise UserError(self.env._(
                        "Path %(path)s passes through several records.",
                        path=path,
                    ))
            values.append(self._format(current))
        return values

    @api.model
    def _format(self, value):
        if value is False or value is None:
            return "—"
        if hasattr(value, "_name"):
            return value.display_name or "—"
        if isinstance(value, bool):
            return "yes" if value else "no"
        return str(value)

    def _payload(self, record, phone):
        """The message body as Meta's Cloud API expects it."""
        self.ensure_one()
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "template",
            "template": {
                "name": self.template_name,
                "language": {"code": self.lang_code},
            },
        }
        values = self._resolve_params(record) if record else []
        if values:
            payload["template"]["components"] = [{
                "type": "body",
                "parameters": [{"type": "text", "text": v} for v in values],
            }]
        return payload

    def _plain_body(self, record):
        """A readable version for the chatter and the message log.

        The real text lives at Meta, so this is the parameters in order rather
        than a guess at the approved wording — a guess would drift from what
        the recipient actually read, which is worse than showing less.
        """
        self.ensure_one()
        values = self._resolve_params(record) if record else []
        joined = " · ".join(values)
        return f"[{self.template_name}] {joined}" if joined else f"[{self.template_name}]"
