from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class ConstructionFormTemplate(models.Model):
    _name = "construction.form.template"
    _description = "Construction Form Template"
    _inherit = ["mail.thread"]
    _order = "name"

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, copy=False)
    project_id = fields.Many2one(
        "project.project", domain=[("is_construction", "=", True)])
    company_id = fields.Many2one(
        "res.company", default=lambda self: self.env.company, required=True)
    description = fields.Html()
    question_ids = fields.One2many(
        "construction.form.question", "template_id", copy=True)
    active = fields.Boolean(default=True)
    recurring = fields.Boolean()
    recurrence_interval = fields.Integer(default=1)
    recurrence_unit = fields.Selection(
        [("days", "Days"), ("weeks", "Weeks"), ("months", "Months")],
        default="weeks")
    next_run_date = fields.Date()
    responsible_id = fields.Many2one("res.users", string="Default Inspector")
    inspection_count = fields.Integer(compute="_compute_inspection_count")
    question_count = fields.Integer(compute="_compute_question_count")

    @api.depends("question_ids")
    def _compute_question_count(self):
        for template in self:
            template.question_count = len(template.question_ids)

    _sql_constraints = [
        ("code_company_uniq", "unique(code, company_id)",
         "The template code must be unique per company."),
        ("positive_interval", "check(recurrence_interval > 0)",
         "The recurrence interval must be greater than zero."),
    ]

    def _compute_inspection_count(self):
        grouped = self.env["construction.form.inspection"].read_group(
            [("template_id", "in", self.ids)], ["template_id"], ["template_id"])
        counts = {g["template_id"][0]: g["template_id_count"] for g in grouped}
        for template in self:
            template.inspection_count = counts.get(template.id, 0)

    @api.constrains("recurring", "project_id")
    def _check_recurring_has_a_project(self):
        """A schedule needs somewhere to raise the inspection."""
        for template in self:
            if template.recurring and not template.project_id:
                raise ValidationError(_(
                    "Set a project on '%s' before scheduling it: a recurring "
                    "inspection has to be raised against one job.",
                    template.name,
                ))

    def action_new_inspection(self):
        self.ensure_one()
        if not self.project_id:
            # The standard forms are company-wide on purpose — one snag sheet
            # for every job, not one per job. Starting one therefore has to ask
            # which project it is for, rather than failing on a required field
            # the user was never shown.
            return {
                "type": "ir.actions.act_window",
                "name": _("New Inspection"),
                "res_model": "construction.form.inspection",
                "views": [[False, "form"]],
                "target": "current",
                "context": {
                    "default_template_id": self.id,
                    "default_inspector_id": (
                        self.responsible_id.id or self.env.user.id),
                },
            }
        inspection = self.env["construction.form.inspection"].create({
            "template_id": self.id,
            "project_id": self.project_id.id,
            "inspector_id": self.responsible_id.id or self.env.user.id,
        })
        inspection.action_start()
        return {
            "type": "ir.actions.act_window",
            "res_model": "construction.form.inspection",
            "res_id": inspection.id,
            "view_mode": "form",
        }

    @api.model
    def _cron_generate_recurring_inspections(self):
        today = fields.Date.context_today(self)
        templates = self.search([
            ("active", "=", True), ("recurring", "=", True),
            ("next_run_date", "!=", False), ("next_run_date", "<=", today),
            # A company-wide template has no project to raise the inspection
            # against. Filtering here rather than failing keeps one misconfigured
            # template from stopping the cron for every other one.
            ("project_id", "!=", False),
        ])
        for template in templates:
            inspection = self.env["construction.form.inspection"].create({
                "template_id": template.id,
                "project_id": template.project_id.id,
                "inspector_id": template.responsible_id.id or self.env.user.id,
                "scheduled_date": template.next_run_date,
            })
            inspection.action_start()
            delta = {
                "days": relativedelta(days=template.recurrence_interval),
                "weeks": relativedelta(weeks=template.recurrence_interval),
                "months": relativedelta(months=template.recurrence_interval),
            }[template.recurrence_unit]
            template.next_run_date += delta


class ConstructionFormQuestion(models.Model):
    _name = "construction.form.question"
    _description = "Construction Form Question"
    _order = "sequence, id"

    template_id = fields.Many2one(
        "construction.form.template", required=True, ondelete="cascade")
    sequence = fields.Integer(default=10)
    section = fields.Char()
    name = fields.Char(string="Question", required=True)
    answer_type = fields.Selection([
        ("yes_no", "Yes / No / N/A"), ("text", "Text"),
        ("number", "Number"), ("date", "Date"),
        ("photo", "Photo"), ("signature", "Signature"),
    ], required=True, default="yes_no")
    required = fields.Boolean()
    instructions = fields.Char()


class ConstructionFormInspection(models.Model):
    _name = "construction.form.inspection"
    _description = "Construction Inspection"
    _inherit = ["mail.thread", "mail.activity.mixin", "construction.approvable"]
    _order = "scheduled_date desc, id desc"

    name = fields.Char(default=lambda self: _("New"), readonly=True, copy=False)
    template_id = fields.Many2one(
        "construction.form.template", required=True, ondelete="restrict")
    project_id = fields.Many2one(
        "project.project", required=True,
        domain=[("is_construction", "=", True)])
    company_id = fields.Many2one(
        "res.company", related="project_id.company_id", store=True)
    scheduled_date = fields.Date(default=fields.Date.context_today, required=True)
    completed_date = fields.Datetime(readonly=True)
    inspector_id = fields.Many2one(
        "res.users", default=lambda self: self.env.user, required=True)
    location = fields.Char()
    state = fields.Selection([
        ("draft", "Draft"), ("in_progress", "In Progress"),
        ("submitted", "Submitted"), ("approved", "Approved"),
        ("rejected", "Rejected"),
    ], default="draft", tracking=True)
    answer_ids = fields.One2many(
        "construction.form.answer", "inspection_id", copy=False)
    notes = fields.Text()
    score = fields.Float(compute="_compute_score", store=True)
    question_count = fields.Integer(compute="_compute_progress")
    answered_count = fields.Integer(compute="_compute_progress")
    remaining_count = fields.Integer(compute="_compute_progress")
    progress = fields.Float(
        compute="_compute_progress",
        help="Share of the checklist answered, as a percentage.")
    # Which answer columns this form actually needs. A snag sheet is all
    # Yes/No, and showing it four permanently empty columns is how a checklist
    # starts looking like a spreadsheet nobody wants to fill in on a phone.
    uses_text = fields.Boolean(compute="_compute_used_answer_types")
    uses_number = fields.Boolean(compute="_compute_used_answer_types")
    uses_date = fields.Boolean(compute="_compute_used_answer_types")
    uses_binary = fields.Boolean(compute="_compute_used_answer_types")

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"]
        for vals in vals_list:
            if not vals.get("name") or vals["name"] == _("New"):
                vals["name"] = sequence.next_by_code(
                    "construction.form.inspection") or _("New")
        return super().create(vals_list)

    @api.depends("answer_ids.answer_yes_no")
    def _compute_score(self):
        for inspection in self:
            scored = inspection.answer_ids.filtered(
                lambda a: a.question_id.answer_type == "yes_no"
                and a.answer_yes_no in ("yes", "no"))
            inspection.score = (
                100.0 * len(scored.filtered(
                    lambda a: a.answer_yes_no == "yes")) / len(scored)
                if scored else 0.0)

    @api.depends("answer_ids.is_answered")
    def _compute_progress(self):
        """How much of the checklist is done.

        Somebody halfway through a fifty-question handover sheet needs to know
        what is left without scrolling the whole list looking for blanks.
        """
        for inspection in self:
            answers = inspection.answer_ids
            answered = len(answers.filtered("is_answered"))
            inspection.question_count = len(answers)
            inspection.answered_count = answered
            inspection.remaining_count = len(answers) - answered
            inspection.progress = 100.0 * answered / len(answers) if answers else 0.0

    @api.depends("answer_ids.answer_type")
    def _compute_used_answer_types(self):
        for inspection in self:
            types = set(inspection.answer_ids.mapped("answer_type"))
            inspection.uses_text = "text" in types
            inspection.uses_number = "number" in types
            inspection.uses_date = "date" in types
            inspection.uses_binary = bool(types & {"photo", "signature"})

    def action_pass_remaining(self):
        """Answer every unanswered Yes/No check with Yes.

        On a real walk almost everything passes and three things do not. Making
        the inspector tap Yes forty times to record that is how checklists end
        up filled in afterwards from memory, which is worse than not filling
        them in at all. Only blank Yes/No checks are touched — nothing already
        answered is overwritten, and free-text, photo and signature questions
        are left alone because there is no safe default for them.
        """
        self.ensure_one()
        blank = self.answer_ids.filtered(
            lambda answer: answer.question_id.answer_type == "yes_no"
            and not answer.answer_yes_no
        )
        if not blank:
            raise UserError(_("Every Yes/No check on this inspection is answered."))
        blank.answer_yes_no = "yes"
        self.message_post(body=_(
            "%s outstanding check(s) marked as Yes.", len(blank)))
        return True

    @api.onchange("template_id")
    def _onchange_template_id(self):
        if self.template_id.project_id:
            self.project_id = self.template_id.project_id

    def action_start(self):
        self = self.with_context(majal_workflow_transition=True)
        for inspection in self.filtered(lambda i: i.state == "draft"):
            existing = inspection.answer_ids.mapped("question_id")
            commands = [
                (0, 0, {"question_id": question.id})
                for question in inspection.template_id.question_ids - existing
            ]
            if commands:
                inspection.write({"answer_ids": commands})
            inspection.state = "in_progress"

    def action_submit(self):
        self = self.with_context(majal_workflow_transition=True)
        for inspection in self:
            missing = inspection.answer_ids.filtered(
                lambda a: a.question_id.required and not a._has_answer())
            if missing:
                raise ValidationError(_(
                    "Complete all required questions before submitting: %s",
                    ", ".join(missing.mapped("question_id.name"))))
            inspection.write({
                "state": "submitted",
                "completed_date": fields.Datetime.now(),
            })

    def _approval_amount(self):
        """An inspection carries no value; rules match on kind alone."""
        self.ensure_one()
        return 0.0

    def _on_approval_granted(self, request):
        self.filtered(lambda i: i.state == "submitted").state = "approved"
        return True

    def action_approve(self):
        self = self.with_context(majal_workflow_transition=True)
        for inspection in self.filtered(lambda i: i.state == "submitted"):
            inspection._check_approved()
            inspection.state = "approved"

    def action_reject(self):
        self = self.with_context(majal_workflow_transition=True)
        self.filtered(lambda i: i.state == "submitted").state = "rejected"

    def action_reset(self):
        self = self.with_context(majal_workflow_transition=True)
        self.state = "in_progress"


class ConstructionFormAnswer(models.Model):
    _name = "construction.form.answer"
    _description = "Construction Form Answer"
    # The order the questions were written in, not the order the answer rows
    # happen to have been created: a checklist that jumps between sections is
    # read as a different checklist.
    _order = "sequence, question_id"

    inspection_id = fields.Many2one(
        "construction.form.inspection", required=True, ondelete="cascade")
    question_id = fields.Many2one(
        "construction.form.question", required=True, ondelete="restrict")
    answer_type = fields.Selection(related="question_id.answer_type")
    # Related copies so the checklist can show the section it belongs to and
    # the guidance written on the question, without the inspector opening the
    # template to find out what the check actually means.
    section = fields.Char(related="question_id.section", string="Section")
    instructions = fields.Char(related="question_id.instructions")
    is_required = fields.Boolean(related="question_id.required")
    sequence = fields.Integer(related="question_id.sequence", store=True)
    answer_yes_no = fields.Selection(
        [("yes", "Yes"), ("no", "No"), ("na", "N/A")])
    answer_text = fields.Text()
    answer_number = fields.Float()
    answer_date = fields.Date()
    answer_binary = fields.Binary(attachment=True)
    answer_filename = fields.Char()
    comment = fields.Char()

    _sql_constraints = [
        ("question_inspection_uniq", "unique(inspection_id, question_id)",
         "Each question can only be answered once per inspection."),
    ]

    is_answered = fields.Boolean(compute="_compute_is_answered")
    is_failed = fields.Boolean(
        compute="_compute_is_answered",
        help="A Yes/No check answered No. These are what become defects.")

    @api.depends("answer_yes_no", "answer_text", "answer_number", "answer_date",
                 "answer_binary", "question_id.answer_type")
    def _compute_is_answered(self):
        for answer in self:
            answer.is_answered = answer._has_answer()
            answer.is_failed = (
                answer.question_id.answer_type == "yes_no"
                and answer.answer_yes_no == "no")

    def _has_answer(self):
        self.ensure_one()
        field_name = {
            "yes_no": "answer_yes_no", "text": "answer_text",
            "number": "answer_number", "date": "answer_date",
            "photo": "answer_binary", "signature": "answer_binary",
        }[self.answer_type]
        value = self[field_name]
        return value is not False and value not in (None, "")

    @api.constrains("question_id", "inspection_id")
    def _check_template(self):
        for answer in self:
            if answer.question_id.template_id != answer.inspection_id.template_id:
                raise UserError(_("The question is not part of this inspection template."))
