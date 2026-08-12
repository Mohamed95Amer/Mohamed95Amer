from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


CONSTRUCTION_PROJECT_MODELS = {
    "project.project": "",
    "project.task": "project_id.",
    "majal.project.document": "project_id.",
    "construction.boq": "project_id.",
    "construction.drawing": "project_id.",
    "construction.rfi": "project_id.",
    "construction.submittal": "project_id.",
    "construction.defect": "project_id.",
    "construction.daily.log": "project_id.",
    "construction.form.inspection": "project_id.",
    "construction.progress.claim": "project_id.",
    "construction.change.event": "project_id.",
    "construction.change.order": "project_id.",
    "construction.subcontract": "project_id.",
    "construction.subcontract.payment": "project_id.",
    "construction.incident": "project_id.",
    "construction.permit": "project_id.",
    "construction.toolbox.talk": "project_id.",
    "construction.tender": "project_id.",
    "construction.material.issue": "project_id.",
    "construction.meeting": "project_id.",
    "construction.bim.model": "project_id.",
    "construction.bim.clash.test": "project_id.",
    "construction.bim.clash": "project_id.",
    "construction.pin": "project_id.",
}

CONSTRUCTION_COMPANY_MODELS = {
    "construction.form.template": "company_id",
    "construction.form.question": "template_id.company_id",
    "construction.approval.rule": "company_id",
    "whatsapp.account": "company_id",
}

CONSTRUCTION_CHILD_MODELS = {
    "construction.boq.section": "boq_id.project_id.",
    "construction.boq.line": "boq_id.project_id.",
    "construction.drawing.revision": "drawing_id.project_id.",
    "construction.daily.log.manpower": "log_id.project_id.",
    "construction.daily.log.equipment": "log_id.project_id.",
    "construction.daily.log.activity": "log_id.project_id.",
    "construction.daily.log.delay": "log_id.project_id.",
    "construction.form.answer": "inspection_id.project_id.",
    "construction.progress.claim.line": "claim_id.project_id.",
    "construction.change.order.line": "change_order_id.project_id.",
    "construction.subcontract.line": "subcontract_id.project_id.",
    "construction.subcontract.payment.line": "payment_id.project_id.",
    "construction.subcontract.backcharge": "payment_id.project_id.",
    "construction.incident.action": "incident_id.project_id.",
    "construction.permit.precaution": "permit_id.project_id.",
    "construction.toolbox.attendee": "talk_id.project_id.",
    "construction.tender.line": "tender_id.project_id.",
    "construction.tender.bid": "tender_id.project_id.",
    "construction.tender.bid.line": "bid_id.tender_id.project_id.",
    "construction.material.issue.line": "issue_id.project_id.",
    "construction.meeting.attendee": "meeting_id.project_id.",
    "construction.meeting.action": "meeting_id.project_id.",
    "construction.bim.element": "model_id.project_id.",
    "construction.bim.property": "element_id.model_id.project_id.",
    "construction.bim.pin": "model_id.project_id.",
}

FACILITY_COMPANY_MODELS = {
    "facility.sla.policy": "company_id",
    "contract.contract": "company_id",
}

FACILITY_ASSIGNMENT_MODELS = {
    "facility.location": {
        "company": "company_id",
        "assignments": [
            "manager_user_id",
            "member_user_ids",
        ],
    },
    "maintenance.equipment": {
        "company": "company_id",
        "assignments": [
            "technician_user_id",
            "owner_user_id",
            "facility_location_id.manager_user_id",
            "facility_location_id.member_user_ids",
        ],
    },
    "maintenance.request": {
        "company": "company_id",
        "assignments": [
            "user_id",
            "equipment_id.technician_user_id",
            "equipment_id.owner_user_id",
            "equipment_id.facility_location_id.manager_user_id",
            "equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.asset.scan": {
        "company": "company_id",
        "assignments": [
            "equipment_id.technician_user_id",
            "equipment_id.owner_user_id",
            "equipment_id.facility_location_id.manager_user_id",
            "equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.floorplan": {
        "company": "company_id",
        "assignments": [
            "location_id.manager_user_id",
            "location_id.member_user_ids",
        ],
    },
    "facility.asset.meter": {
        "company": "equipment_id.company_id",
        "assignments": [
            "equipment_id.technician_user_id",
            "equipment_id.owner_user_id",
            "equipment_id.facility_location_id.manager_user_id",
            "equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.asset.meter.reading": {
        "company": "meter_id.equipment_id.company_id",
        "assignments": [
            "meter_id.equipment_id.technician_user_id",
            "meter_id.equipment_id.owner_user_id",
            "meter_id.equipment_id.facility_location_id.manager_user_id",
            "meter_id.equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.spare.line": {
        "company": "equipment_id.company_id",
        "assignments": [
            "equipment_id.technician_user_id",
            "equipment_id.owner_user_id",
            "equipment_id.facility_location_id.manager_user_id",
            "equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.pin": {
        "company": "floorplan_id.company_id",
        "assignments": [
            "floorplan_id.location_id.manager_user_id",
            "floorplan_id.location_id.member_user_ids",
        ],
    },
    "facility.request.task": {
        "company": "request_id.company_id",
        "assignments": [
            "request_id.user_id",
            "request_id.equipment_id.technician_user_id",
            "request_id.equipment_id.owner_user_id",
            "request_id.equipment_id.facility_location_id.manager_user_id",
            "request_id.equipment_id.facility_location_id.member_user_ids",
        ],
    },
    "facility.request.part": {
        "company": "request_id.company_id",
        "assignments": [
            "request_id.user_id",
            "request_id.equipment_id.technician_user_id",
            "request_id.equipment_id.owner_user_id",
            "request_id.equipment_id.facility_location_id.manager_user_id",
            "request_id.equipment_id.facility_location_id.member_user_ids",
        ],
    },
}

FACILITY_SCOPE_ONLY_MODELS = {
    "facility.failure.code",
    "facility.job.plan",
    "facility.job.plan.task",
    "facility.pm.plan",
    "facility.parts.summary",
}


class ProjectProject(models.Model):
    _inherit = "project.project"

    majal_manager_id = fields.Many2one(
        "res.users",
        string="Majal Project Manager",
        tracking=True,
        domain="[('share', '=', False)]",
    )
    majal_member_ids = fields.Many2many(
        "res.users",
        "project_majal_member_rel",
        "project_id",
        "user_id",
        string="Majal Project Team",
        domain="[('share', '=', False)]",
    )

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            is_const = vals.get("is_construction")
            if is_const is None:
                is_const = self._context.get("default_is_construction")
            if is_const and not vals.get("company_id"):
                vals["company_id"] = self.env.company.id
        return super().create(vals_list)

    @api.constrains("is_construction", "company_id")
    def _check_construction_company(self):
        if any(project.is_construction and not project.company_id for project in self):
            raise ValidationError(
                _("Every construction project must belong to a company.")
            )


class FacilityLocation(models.Model):
    _inherit = "facility.location"

    manager_user_id = fields.Many2one(
        "res.users",
        string="Facility Manager",
        domain="[('share', '=', False)]",
    )
    member_user_ids = fields.Many2many(
        "res.users",
        "facility_location_majal_member_rel",
        "location_id",
        "user_id",
        string="Facility Team",
        domain="[('share', '=', False)]",
    )


class ResUsersTenantSecurity(models.Model):
    _inherit = "res.users"

    @api.model
    def _majal_validate_field_path(self, model_name, field_path):
        if model_name not in self.env.registry:
            return False
        current_model = self.env[model_name]
        parts = field_path.rstrip(".").split(".")
        for index, part in enumerate(parts):
            field = current_model._fields.get(part)
            if not field:
                raise ValidationError(
                    _(
                        "Majal security path %(path)s is invalid on %(model)s.",
                        path=field_path,
                        model=model_name,
                    )
                )
            if index < len(parts) - 1:
                if not field.comodel_name:
                    raise ValidationError(
                        _(
                            "Majal security path %(path)s is not relational.",
                            path=field_path,
                        )
                    )
                current_model = self.env[field.comodel_name]
        return True

    @api.model
    def _majal_upsert_rule(self, name, model_name, domain_force):
        model_record = self.env["ir.model"].sudo().search(
            [("model", "=", model_name)], limit=1
        )
        if not model_record:
            return
        rule_model = self.env["ir.rule"].sudo()
        rule = rule_model.search(
            [("name", "=", name), ("model_id", "=", model_record.id)],
            limit=1,
        )
        values = {
            "name": name,
            "model_id": model_record.id,
            "domain_force": domain_force,
            "global": True,
            "perm_read": True,
            "perm_write": True,
            "perm_create": True,
            "perm_unlink": True,
        }
        if rule:
            rule.write(values)
        else:
            rule_model.create(values)

    @api.model
    def _majal_install_tenant_rules(self):
        """Install company, workspace and assignment boundaries."""
        company = self.env.company
        unassigned = self.env["project.project"].sudo().search(
            [("is_construction", "=", True), ("company_id", "=", False)]
        )
        for project in unassigned:
            project.with_context(majal_tenant_backfill=True).write(
                {"company_id": project.create_uid.company_id.id or company.id}
            )

        for model_name, prefix in CONSTRUCTION_PROJECT_MODELS.items():
            company_path = f"{prefix}company_id"
            manager_path = f"{prefix}majal_manager_id"
            members_path = f"{prefix}majal_member_ids"
            if model_name == "project.project":
                company_path = "company_id"
                manager_path = "majal_manager_id"
                members_path = "majal_member_ids"
            for path in (company_path, manager_path, members_path):
                self._majal_validate_field_path(model_name, path)
            allowed = (
                f"[('{company_path}', 'in', company_ids)] "
                "if (not user.majal_role_id or user.majal_role_id.rank >= 40) else "
                f"[('{company_path}', 'in', company_ids), '|', "
                f"('{manager_path}', '=', user.id), "
                f"('{members_path}', 'in', [user.id])]"
            )
            if model_name == "project.project":
                allowed = f"[('is_construction', '=', True)] + ({allowed})"
            domain = (
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'facilities' "
                f"else ({allowed}))"
            )
            self._majal_upsert_rule(
                f"Majal tenant: {model_name}", model_name, domain
            )

        for model_name, company_path in CONSTRUCTION_COMPANY_MODELS.items():
            self._majal_validate_field_path(model_name, company_path)
            self._majal_upsert_rule(
                f"Majal tenant: {model_name}",
                model_name,
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'facilities' "
                f"else [('{company_path}', 'in', company_ids)])",
            )

        for model_name, prefix in CONSTRUCTION_CHILD_MODELS.items():
            company_path = f"{prefix}company_id"
            manager_path = f"{prefix}majal_manager_id"
            members_path = f"{prefix}majal_member_ids"
            for path in (company_path, manager_path, members_path):
                self._majal_validate_field_path(model_name, path)
            domain = (
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'facilities' "
                "else ("
                f"[('{company_path}', 'in', company_ids)] "
                "if (not user.majal_role_id or user.majal_role_id.rank >= 40) else "
                f"[('{company_path}', 'in', company_ids), '|', "
                f"('{manager_path}', '=', user.id), "
                f"('{members_path}', 'in', [user.id])]))"
            )
            self._majal_upsert_rule(
                f"Majal tenant: {model_name}", model_name, domain
            )

        for model_name, company_path in FACILITY_COMPANY_MODELS.items():
            self._majal_validate_field_path(model_name, company_path)
            self._majal_upsert_rule(
                f"Majal tenant: {model_name}",
                model_name,
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'construction' "
                f"else [('{company_path}', 'in', company_ids)])",
            )

        for model_name, configuration in FACILITY_ASSIGNMENT_MODELS.items():
            company_path = configuration["company"]
            assignment_paths = configuration["assignments"]
            self._majal_validate_field_path(model_name, company_path)
            for path in assignment_paths:
                self._majal_validate_field_path(model_name, path)
            assignment_domain = []
            if len(assignment_paths) > 1:
                assignment_domain.extend(["'|'" for _item in assignment_paths[:-1]])
            for path in assignment_paths:
                operator = "in" if path.endswith("_ids") else "="
                value = "[user.id]" if operator == "in" else "user.id"
                assignment_domain.append(
                    "('%s', '%s', %s)" % (path, operator, value)
                )
            restricted = (
                "[('%s', 'in', company_ids), %s]"
                % (company_path, ", ".join(assignment_domain))
            )
            self._majal_upsert_rule(
                f"Majal tenant: {model_name}",
                model_name,
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'construction' "
                f"else ([('{company_path}', 'in', company_ids)] "
                f"if (not user.majal_role_id or user.majal_role_id.rank >= 40) else {restricted}))",
            )

        for model_name in FACILITY_SCOPE_ONLY_MODELS:
            self._majal_upsert_rule(
                f"Majal workspace: {model_name}",
                model_name,
                "[(1, '=', 1)] if user.share else "
                "([(0, '=', 1)] if user.majal_industry_scope == 'construction' "
                "else [(1, '=', 1)])",
            )
        self.env.registry.clear_cache()
        return True
