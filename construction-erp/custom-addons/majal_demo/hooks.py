import base64
from datetime import timedelta

from odoo import Command, fields


DEMO_PASSWORD = "MajalDemo!2026"


def _company(env, name, **values):
    company = env["res.company"].sudo().search([("name", "=", name)], limit=1)
    if company:
        return company
    return env["res.company"].sudo().create({"name": name, **values})


def _user(env, login, name, company, role_code, scope):
    user = env["res.users"].sudo().with_context(active_test=False).search(
        [("login", "=", login)], limit=1
    )
    role = env["majal.access.role"].sudo().search(
        [("code", "=", role_code)], limit=1
    )
    group_ids = env["res.users"].sudo()._majal_group_ids_for(role, scope)
    values = {
        "name": name,
        "login": login,
        "email": login,
        "password": DEMO_PASSWORD,
        "active": True,
        "company_id": company.id,
        "company_ids": [Command.set([company.id])],
        "majal_role_id": role.id,
        "majal_industry_scope": scope,
        "groups_id": [Command.set(sorted(group_ids))],
    }
    if user:
        user.sudo().write(values)
    else:
        user = (
            env["res.users"]
            .sudo()
            .with_context(no_reset_password=True)
            .create(values)
        )
    return user


def _partner(env, name, company, email):
    partner = env["res.partner"].sudo().search(
        [("name", "=", name), ("company_id", "=", company.id)], limit=1
    )
    return partner or env["res.partner"].sudo().create(
        {
            "name": name,
            "company_type": "company",
            "company_id": company.id,
            "email": email,
        }
    )


def _project(env, name, code, company, manager, members, **values):
    project = env["project.project"].sudo().search(
        [("project_code", "=", code), ("company_id", "=", company.id)], limit=1
    )
    payload = {
        "name": name,
        "project_code": code,
        "company_id": company.id,
        "is_construction": True,
        "majal_manager_id": manager.id,
        "majal_member_ids": [Command.set(members.ids)],
        **values,
    }
    if project:
        project.write(payload)
        return project
    return env["project.project"].sudo().create(payload)


def _seed_construction(env, company, users):
    today = fields.Date.today()
    client = _partner(env, "Demo Horizon Developments", company, "client@demo.local")
    consultant = _partner(env, "Demo Axis Consultants", company, "consultant@demo.local")
    subcontractor = _partner(env, "Demo Precision MEP", company, "mep@demo.local")
    manager = users["pm"]
    team = users["engineer"] | users["field"]

    projects = [
        _project(
            env,
            "Harbour View Residences",
            "MJL-HVR",
            company,
            manager,
            team,
            construction_stage="execution",
            project_type="building",
            client_id=client.id,
            consultant_id=consultant.id,
            main_contractor_id=company.partner_id.id,
            site_address="Dubai Harbour — Demo Site",
            contract_value=128_500_000,
            date_commencement=today - timedelta(days=240),
            date_completion_planned=today + timedelta(days=310),
        ),
        _project(
            env,
            "North District Utilities",
            "MJL-NDU",
            company,
            manager,
            team,
            construction_stage="mobilization",
            project_type="infrastructure",
            client_id=client.id,
            consultant_id=consultant.id,
            contract_value=64_200_000,
            date_commencement=today - timedelta(days=35),
            date_completion_planned=today + timedelta(days=420),
        ),
        _project(
            env,
            "Central Hotel Fit-Out",
            "MJL-CHF",
            company,
            manager,
            team,
            construction_stage="handover",
            project_type="fitout",
            client_id=client.id,
            consultant_id=consultant.id,
            contract_value=18_750_000,
            date_commencement=today - timedelta(days=330),
            date_completion_planned=today + timedelta(days=28),
        ),
    ]
    primary = projects[0]

    for index, (title, user, stage) in enumerate(
        [
            ("Complete Level 12 blockwork", users["field"], "01_in_progress"),
            ("Coordinate riser openings", users["engineer"], "01_in_progress"),
            ("Prepare façade mock-up", users["field"], "01_in_progress"),
            ("Review Level 08 ceiling zone", users["engineer"], "01_in_progress"),
            ("Close consultant comments", users["pm"], "01_in_progress"),
        ],
        start=1,
    ):
        if not env["project.task"].sudo().search(
            [("name", "=", title), ("project_id", "=", primary.id)], limit=1
        ):
            env["project.task"].sudo().create(
                {
                    "name": title,
                    "project_id": primary.id,
                    "user_ids": [Command.set([user.id])],
                    "state": stage,
                    "date_deadline": today + timedelta(days=index * 3),
                }
            )

    boq = env["construction.boq"].sudo().search(
        [("project_id", "=", primary.id), ("version", "=", 1)], limit=1
    )
    if not boq:
        boq = env["construction.boq"].sudo().create(
            {"name": "Harbour View Contract BOQ", "project_id": primary.id}
        )
        sections = {}
        for sequence, code, name in [
            (10, "01", "Preliminaries"),
            (20, "03", "Concrete"),
            (30, "09", "Finishes"),
        ]:
            sections[code] = env["construction.boq.section"].sudo().create(
                {
                    "boq_id": boq.id,
                    "sequence": sequence,
                    "code": code,
                    "name": name,
                }
            )
        lines = [
            ("01.10", "Site management and supervision", "01", 18, 120000, 82000),
            ("01.20", "Temporary works and logistics", "01", 1, 1750000, 1320000),
            ("03.10", "Reinforced concrete slabs", "03", 18500, 420, 315),
            ("03.20", "Reinforced concrete walls", "03", 6200, 510, 390),
            ("03.30", "Reinforcement steel", "03", 2450, 3450, 2980),
            ("09.10", "Porcelain floor tiles", "09", 12800, 165, 118),
            ("09.20", "Gypsum board ceilings", "09", 18400, 142, 96),
            ("09.30", "Internal painting", "09", 56500, 38, 22),
            ("09.40", "Timber doors and ironmongery", "09", 640, 2850, 2210),
            ("09.50", "Stone feature walls", "09", 1250, 680, 520),
        ]
        for item_code, name, section_code, quantity, sell, cost in lines:
            env["construction.boq.line"].sudo().create(
                {
                    "boq_id": boq.id,
                    "section_id": sections[section_code].id,
                    "item_code": item_code,
                    "name": name,
                    "quantity": quantity,
                    "unit_rate": sell,
                    "cost_material": cost,
                }
            )

    for index in range(1, 7):
        name = "Demo defect %02d" % index
        if not env["construction.defect"].sudo().search(
            [("name", "=", name), ("project_id", "=", primary.id)], limit=1
        ):
            env["construction.defect"].sudo().create(
                {
                    "name": name,
                    "project_id": primary.id,
                    "description": "Acceptance scenario for site rectification.",
                    "location": "Level %02d — Zone %s" % (index + 2, chr(64 + index)),
                    "severity": ("low", "medium", "high", "critical")[index % 4],
                    "state": ("open", "in_progress", "ready")[index % 3],
                    "assigned_user_id": (
                        users["field"].id if index % 2 else users["engineer"].id
                    ),
                    "responsible_subcontractor_id": subcontractor.id,
                    "date_required": today + timedelta(days=index - 3),
                }
            )

    for index in range(1, 4):
        title = "RFI — Demo coordination item %02d" % index
        if not env["construction.rfi"].sudo().search(
            [("name", "=", title), ("project_id", "=", primary.id)], limit=1
        ):
            env["construction.rfi"].sudo().create(
                {
                    "name": title,
                    "project_id": primary.id,
                    "question": "<p>Confirm coordinated detail for the demo workflow.</p>",
                    "discipline": ("architectural", "structural", "mep")[index - 1],
                    "ball_in_court_id": consultant.id,
                    "date_required": today + timedelta(days=index * 2),
                    "raised_by_id": users["engineer"].id,
                    "state": "submitted" if index < 3 else "draft",
                }
            )

    template = env["construction.form.template"].sudo().search(
        [("code", "=", "DEMO-QA-PREPOUR"), ("company_id", "=", company.id)],
        limit=1,
    )
    if not template:
        template = env["construction.form.template"].sudo().create(
            {
                "name": "Demo Pre-Pour Inspection",
                "code": "DEMO-QA-PREPOUR",
                "company_id": company.id,
                "project_id": primary.id,
                "responsible_id": users["field"].id,
                "question_ids": [
                    Command.create(
                        {
                            "sequence": 10,
                            "section": "Documents",
                            "name": "Approved drawing is available",
                            "answer_type": "yes_no",
                            "required": True,
                        }
                    ),
                    Command.create(
                        {
                            "sequence": 20,
                            "section": "Structure",
                            "name": "Reinforcement matches approved drawing",
                            "answer_type": "yes_no",
                            "required": True,
                        }
                    ),
                    Command.create(
                        {
                            "sequence": 30,
                            "section": "Structure",
                            "name": "Concrete quantity",
                            "answer_type": "number",
                        }
                    ),
                    Command.create(
                        {
                            "sequence": 40,
                            "section": "Notes",
                            "name": "Inspector observation",
                            "answer_type": "text",
                        }
                    ),
                ],
            }
        )
    inspection = env["construction.form.inspection"].sudo().search(
        [
            ("template_id", "=", template.id),
            ("project_id", "=", primary.id),
            ("state", "in", ["draft", "in_progress"]),
        ],
        limit=1,
    )
    if not inspection:
        inspection = env["construction.form.inspection"].sudo().create(
            {
                "template_id": template.id,
                "project_id": primary.id,
                "inspector_id": users["field"].id,
                "scheduled_date": today,
                "location": "Level 10 slab",
            }
        )
        inspection.action_start()

    minimal_pdf = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
    )
    for index, (number, title, revision) in enumerate(
        [("A-101", "Level 03 Plan", "C"), ("S-220", "Typical Slab Detail", "B")],
        start=1,
    ):
        drawing = env["construction.drawing"].sudo().search(
            [("project_id", "=", primary.id), ("number", "=", number)], limit=1
        )
        if not drawing:
            drawing = env["construction.drawing"].sudo().create(
                {
                    "project_id": primary.id,
                    "number": number,
                    "name": title,
                    "discipline": "architectural" if index == 1 else "structural",
                }
            )
            attachment = env["ir.attachment"].sudo().create(
                {
                    "name": "%s-R%s.pdf" % (number, revision),
                    "datas": base64.b64encode(minimal_pdf),
                    "mimetype": "application/pdf",
                    "res_model": "construction.drawing",
                    "res_id": drawing.id,
                    "company_id": company.id,
                }
            )
            env["construction.drawing.revision"].sudo().create(
                {
                    "drawing_id": drawing.id,
                    "revision": revision,
                    "attachment_id": attachment.id,
                    "state": "current",
                    "issued_for": "construction",
                    "issue_date": today - timedelta(days=index),
                }
            )

    for offset in range(3):
        log_date = today - timedelta(days=offset)
        if not env["construction.daily.log"].sudo().search(
            [("project_id", "=", primary.id), ("log_date", "=", log_date)], limit=1
        ):
            env["construction.daily.log"].sudo().create(
                {
                    "project_id": primary.id,
                    "log_date": log_date,
                    "prepared_by_id": users["field"].id,
                    "weather": ("sunny", "hot", "windy")[offset],
                    "temperature": 34 + offset,
                    "notes": "Demo daily progress and coordination notes.",
                }
            )
    return projects


def _seed_facilities(env, company, users):
    root = env["facility.location"].sudo().search(
        [("code", "=", "DEMO-FM"), ("company_id", "=", company.id)], limit=1
    )
    if not root:
        root = env["facility.location"].sudo().create(
            {
                "name": "Demo Business Park",
                "code": "DEMO-FM",
                "location_type": "site",
                "company_id": company.id,
                "manager_user_id": users["manager"].id,
                "member_user_ids": [Command.set([users["supervisor"].id, users["tech"].id])],
            }
        )
    building = env["facility.location"].sudo().search(
        [("code", "=", "DEMO-T1"), ("company_id", "=", company.id)], limit=1
    )
    if not building:
        building = env["facility.location"].sudo().create(
            {
                "name": "Tower One",
                "code": "DEMO-T1",
                "location_type": "building",
                "parent_id": root.id,
                "company_id": company.id,
                "manager_user_id": users["manager"].id,
                "member_user_ids": [Command.set([users["supervisor"].id, users["tech"].id])],
            }
        )

    category = env["maintenance.equipment.category"].sudo().search(
        [("name", "=", "Demo HVAC & Building Services")], limit=1
    )
    if not category:
        category = env["maintenance.equipment.category"].sudo().create(
            {"name": "Demo HVAC & Building Services"}
        )
    team_values = {"name": "Demo Facilities Team"}
    if "company_id" in env["maintenance.team"]._fields:
        team_values["company_id"] = company.id
    team = env["maintenance.team"].sudo().search(
        [("name", "=", team_values["name"])], limit=1
    ) or env["maintenance.team"].sudo().create(team_values)

    assets = env["maintenance.equipment"]
    for index, (name, criticality) in enumerate(
        [
            ("AHU-T1-01", "critical"),
            ("Chilled Water Pump P-01", "high"),
            ("Passenger Lift L-01", "critical"),
            ("Fire Alarm Panel FAP-01", "critical"),
            ("Domestic Water Pump DWP-01", "high"),
            ("Generator GEN-01", "critical"),
        ],
        start=1,
    ):
        asset = env["maintenance.equipment"].sudo().search(
            [("name", "=", name), ("company_id", "=", company.id)], limit=1
        )
        if not asset:
            asset = env["maintenance.equipment"].sudo().create(
                {
                    "name": name,
                    "company_id": company.id,
                    "category_id": category.id,
                    "maintenance_team_id": team.id,
                    "technician_user_id": users["tech"].id,
                    "owner_user_id": users["manager"].id,
                    "facility_location_id": building.id,
                    "criticality": criticality,
                    "nfc_uid": "04-DEMO-%04d" % index,
                    "purchase_value": 35000 * index,
                    "portal_selectable": True,
                }
            )
        assets |= asset

    job_plan = env["facility.job.plan"].sudo().search(
        [("name", "=", "Demo Critical Asset Service")], limit=1
    )
    if not job_plan:
        job_plan = env["facility.job.plan"].sudo().create(
            {
                "name": "Demo Critical Asset Service",
                "estimated_duration": 3.5,
                "task_ids": [
                    Command.create({"sequence": 10, "name": "Apply isolation and verify safe state"}),
                    Command.create({"sequence": 20, "name": "Inspect and clean components"}),
                    Command.create({"sequence": 30, "name": "Record readings and condition"}),
                    Command.create({"sequence": 40, "name": "Restore and functional test"}),
                ],
            }
        )
    for index, asset in enumerate(assets[:5], start=1):
        title = "Demo work order %02d — %s" % (index, asset.name)
        if not env["maintenance.request"].sudo().search(
            [("name", "=", title), ("company_id", "=", company.id)], limit=1
        ):
            values = {
                "name": title,
                "company_id": company.id,
                "equipment_id": asset.id,
                "user_id": users["tech"].id,
                "maintenance_team_id": team.id,
                "maintenance_type": "corrective" if index % 2 else "preventive",
                "priority": "3" if asset.criticality == "critical" else "2",
                "description": "Demo diagnosis, checklist and completion workflow.",
                "job_plan_id": job_plan.id,
            }
            env["maintenance.request"].sudo().create(values)
    return root


def _seed_documents(env, company, project, users):
    english = env["majal.document.template"].sudo().search(
        [("code", "=", "DEMO-LETTER-EN"), ("company_id", "=", company.id)], limit=1
    )
    if not english:
        english = env["majal.document.template"].sudo().create(
            {
                "name": "Demo Project Letter",
                "code": "DEMO-LETTER-EN",
                "company_id": company.id,
                "language": "en_US",
                "document_type": "letter",
                "body_html": (
                    "<h3>Project correspondence</h3>"
                    "<p>Dear {{ recipient.name }},</p>"
                    "<p>Regarding <strong>{{ project.name }}</strong>, this is "
                    "controlled document {{ document.reference }}.</p>"
                    "<p>For {{ company.name }}.</p>"
                ),
            }
        )
    arabic = env["majal.document.template"].sudo().search(
        [("code", "=", "DEMO-LETTER-AR"), ("company_id", "=", company.id)], limit=1
    )
    if not arabic:
        arabic = env["majal.document.template"].sudo().create(
            {
                "name": "خطاب مشروع تجريبي",
                "code": "DEMO-LETTER-AR",
                "company_id": company.id,
                "language": "ar_001",
                "document_type": "letter",
                "body_html": (
                    "<div dir='rtl'><h3>مراسلات المشروع</h3>"
                    "<p>السادة {{ recipient.name }}،</p>"
                    "<p>بالإشارة إلى مشروع <strong>{{ project.name }}</strong>، "
                    "هذه الوثيقة الخاضعة للرقابة رقم {{ document.reference }}.</p></div>"
                ),
            }
        )
    recipient = env["res.partner"].sudo().search(
        [("name", "=", "Demo Axis Consultants"), ("company_id", "=", company.id)],
        limit=1,
    )
    document = env["majal.document"].sudo().search(
        [("name", "=", "Demo Approved Coordination Letter"), ("company_id", "=", company.id)],
        limit=1,
    )
    if not document:
        document = env["majal.document"].with_user(users["pm"]).create(
            {
                "name": "Demo Approved Coordination Letter",
                "company_id": company.id,
                "project_id": project.id,
                "recipient_id": recipient.id,
                "template_id": english.id,
                "approver_id": users["admin"].id,
                "body_html": "<p>Initial content</p>",
            }
        )
        document.with_user(users["pm"]).action_apply_template()
        document.with_user(users["pm"]).action_submit()
        document.with_user(users["admin"]).action_approve()
        document.with_user(users["admin"]).action_issue()

    sheet = env["majal.sheet"].sudo().search(
        [("name", "=", "Demo Tender Estimate"), ("company_id", "=", company.id)],
        limit=1,
    )
    if not sheet:
        sheet = env["majal.sheet"].with_user(users["pm"]).create(
            {
                "name": "Demo Tender Estimate",
                "company_id": company.id,
                "project_id": project.id,
                "sheet_type": "estimate",
                "line_ids": [
                    Command.create(
                        {
                            "code": "EST-01",
                            "description": "Mobilization",
                            "unit": "LS",
                            "quantity": 1,
                            "unit_rate": 850000,
                        }
                    ),
                    Command.create(
                        {
                            "code": "EST-02",
                            "description": "Concrete frame",
                            "unit": "m²",
                            "quantity": 18500,
                            "unit_rate": 720,
                        }
                    ),
                    Command.create(
                        {
                            "code": "EST-03",
                            "description": "MEP services",
                            "unit": "LS",
                            "quantity": 1,
                            "unit_rate": 18500000,
                        }
                    ),
                ],
            }
        )
        sheet.with_user(users["pm"]).action_freeze()


def post_init_hook(env):
    contracting = _company(
        env,
        "Majal Demo Contracting LLC",
        majal_trading_name="Majal Demo Contracting",
        majal_registration_number="DEMO-CN-2026",
        majal_tax_registration_number="100000000000001",
        majal_document_email="documents@demo.local",
        majal_document_phone="+971 4 555 0100",
        majal_document_address="Dubai, United Arab Emirates — Demo Environment",
    )
    facilities = _company(
        env,
        "Majal Demo Facilities LLC",
        majal_trading_name="Majal Demo Facilities",
        majal_registration_number="DEMO-FM-2026",
        majal_tax_registration_number="100000000000002",
        majal_document_email="fm@demo.local",
        majal_document_phone="+971 4 555 0200",
        majal_document_address="Abu Dhabi, United Arab Emirates — Demo Environment",
    )

    owner = _user(
        env, "demo.owner@majal.local", "Demo Platform Owner",
        contracting, "platform_owner", "both"
    )
    owner.sudo().write(
        {"company_ids": [Command.set([contracting.id, facilities.id])]}
    )
    construction_users = {
        "owner": owner,
        "admin": _user(
            env, "demo.admin@majal.local", "Demo Company Administrator",
            contracting, "company_admin", "both"
        ),
        "ops": _user(
            env, "demo.ops@majal.local", "Demo Operations Manager",
            contracting, "operations_manager", "both"
        ),
        "pm": _user(
            env, "demo.pm@majal.local", "Demo Project Manager",
            contracting, "manager", "construction"
        ),
        "engineer": _user(
            env, "demo.engineer@majal.local", "Demo Site Engineer",
            contracting, "supervisor", "construction"
        ),
        "field": _user(
            env, "demo.field@majal.local", "Demo Field User",
            contracting, "field_user", "construction"
        ),
    }
    facility_users = {
        "manager": _user(
            env, "demo.fm.manager@majal.local", "Demo Facility Manager",
            facilities, "manager", "facilities"
        ),
        "supervisor": _user(
            env, "demo.fm.supervisor@majal.local", "Demo FM Supervisor",
            facilities, "supervisor", "facilities"
        ),
        "tech": _user(
            env, "demo.tech@majal.local", "Demo Technician",
            facilities, "field_user", "facilities"
        ),
    }

    projects = _seed_construction(env, contracting, construction_users)
    _seed_facilities(env, facilities, facility_users)
    _seed_documents(env, contracting, projects[0], construction_users)
    env["res.users"].sudo()._majal_install_tenant_rules()
    env["ir.config_parameter"].sudo().set_param("majal.demo.installed", "True")
