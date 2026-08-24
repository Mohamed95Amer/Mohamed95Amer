import base64
from datetime import timedelta

from odoo import Command, fields
from odoo.tools import file_open

from .enterprise_demo import seed_enterprise_demo
from .office_demo import seed_spreadsheets
from .property_demo import seed_property_demo


DEMO_PASSWORD = "MajalDemo!2026"


def _company(env, name, **values):
    company = env["res.company"].sudo().search([("name", "=", name)], limit=1)
    if company:
        company.write(values)
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


def _enable_demo_intelligence(env, companies, users):
    env["ir.config_parameter"].sudo().set_param("majal.demo.installed", "True")
    action = env.ref("majal_ai.action_ai_workspace")
    spreadsheet_group = env.ref("spreadsheet_oca.group_user")
    for user in users:
        user.sudo().write({
            "action_id": action.id,
            "groups_id": [Command.link(spreadsheet_group.id)],
        })
    for company in companies:
        provider = env["majal.ai.provider"].sudo().search(
            [("code", "=", "demo"), ("company_id", "=", company.id)], limit=1
        )
        values = {
            "name": "Majal Demo Guide",
            "code": "demo",
            "company_id": company.id,
            "endpoint": "https://demo.majal.invalid/v1",
            "model_name": "guided-demo",
            "enabled": True,
            "sequence": 3,
            "daily_request_limit": 500,
            "monthly_token_limit": 0,
        }
        if provider:
            provider.write(values)
        else:
            env["majal.ai.provider"].sudo().create(values)


def _seed_approval_cycles(env, company, users):
    model_id = env["ir.model"]._get_id("construction.boq")
    rules = [
        (
            "Demo project commercial approval",
            0,
            500_000,
            [("Project manager review", users["pm"]), ("Commercial review", users["ops"])],
        ),
        (
            "Demo executive commercial approval",
            500_000,
            0,
            [
                ("Project manager review", users["pm"]),
                ("Operations review", users["ops"]),
                ("Company approval", users["admin"]),
            ],
        ),
    ]
    for name, amount_from, amount_to, steps in rules:
        rule = env["construction.approval.rule"].sudo().search(
            [("name", "=", name), ("company_id", "=", company.id)], limit=1
        )
        values = {
            "name": name,
            "company_id": company.id,
            "model_id": model_id,
            "amount_from": amount_from,
            "amount_to": amount_to,
            "step_ids": [
                Command.create({
                    "sequence": index * 10,
                    "name": label,
                    "user_id": user.id,
                })
                for index, (label, user) in enumerate(steps, 1)
            ],
        }
        if rule:
            values.pop("step_ids")
            rule.write(values)
        else:
            env["construction.approval.rule"].sudo().create(values)


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

    with file_open("construction_pin/demo/floorplan.pdf", "rb") as handle:
        plan_pdf = handle.read()
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
        revision_record = env["construction.drawing.revision"].sudo().search(
            [("drawing_id", "=", drawing.id), ("revision", "=", revision)], limit=1
        )
        if revision_record:
            revision_record.attachment_id.write({"datas": base64.b64encode(plan_pdf)})
        else:
            attachment = env["ir.attachment"].sudo().create(
                {
                    "name": "%s-R%s.pdf" % (number, revision),
                    "datas": base64.b64encode(plan_pdf),
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
        if index == 1 and not env["construction.drawing.revision"].sudo().search(
            [("drawing_id", "=", drawing.id), ("revision", "=", "A")], limit=1
        ):
            old_attachment = env["ir.attachment"].sudo().create({
                "name": f"{number}-RA.pdf",
                "datas": base64.b64encode(plan_pdf),
                "mimetype": "application/pdf",
                "res_model": "construction.drawing",
                "res_id": drawing.id,
                "company_id": company.id,
            })
            env["construction.drawing.revision"].sudo().create({
                "drawing_id": drawing.id,
                "revision": "A",
                "attachment_id": old_attachment.id,
                "state": "superseded",
                "issued_for": "tender",
                "issue_date": today - timedelta(days=45),
            })

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

    # Documents & Commercial had a model, four views, an action and a menu, but
    # nothing ever created a record — so the screen opened empty for every user
    # and read as broken. One document per type, spread across the states the
    # form actually offers, so the register shows its own workflow.
    documents = [
        ("tender", "Tender pack — main works", client, 128_500_000, "closed", -180),
        ("bid_request", "Bidding request — MEP package", subcontractor, 0, "closed", -150),
        ("quotation", "Quotation — MEP package", subcontractor, 18_400_000, "approved", -140),
        ("contract", "Subcontract — MEP package", subcontractor, 18_400_000, "approved", -120),
        ("permit", "Authority permit — excavation", consultant, 0, "approved", -110),
        ("sales_order", "Variation order — basement waterproofing", client, 197_400, "under_review", -20),
        ("general", "Method statement — facade installation", consultant, 0, "submitted", -6),
    ]
    for document_type, title, partner, amount, state, day_offset in documents:
        if env["majal.project.document"].sudo().search(
            [("name", "=", title), ("project_id", "=", primary.id)], limit=1
        ):
            continue
        values = {
            "name": title,
            "project_id": primary.id,
            "document_type": document_type,
            "partner_id": partner.id,
            "date_document": today + timedelta(days=day_offset),
            "amount": amount,
            "state": state,
            "description": "<p>Demo record for the Documents &amp; Commercial register.</p>",
        }
        # create() is not guarded the way write() is, so the seeded states can be
        # set directly — but the dates have to come with them or the register
        # shows approved documents nobody ever approved.
        document_date = values["date_document"]
        if state in ("submitted", "under_review", "approved", "rejected", "closed"):
            values["submitted_by_id"] = users["engineer"].id
            values["approver_id"] = manager.id
            values["submitted_date"] = fields.Datetime.to_datetime(document_date)
        if state in ("approved", "closed"):
            values["approved_by_id"] = manager.id
            values["approved_date"] = fields.Datetime.to_datetime(
                document_date + timedelta(days=2)
            )
        env["majal.project.document"].sudo().create(values)

    # Change orders and their variations. Same reason as the documents above:
    # the register existed and was empty, so the restructure that puts the
    # variations on the change order had nothing to show.
    change_orders = [
        ("Basement waterproofing — specification change", "design_change",
         197_400, "Consultant revised the tanking specification after the "
                  "ground-water survey; the original system no longer complies."),
        ("Lobby finishes — client upgrade", "client_request",
         88_250, "Client selected a higher-grade stone after the mock-up "
                 "review. Rate difference only, quantities unchanged."),
    ]
    for title, origin, amount, reason in change_orders:
        event = env["construction.change.event"].sudo().search(
            [("name", "=", title), ("project_id", "=", primary.id)], limit=1
        )
        if not event:
            event = env["construction.change.event"].sudo().create(
                {
                    "name": title,
                    "project_id": primary.id,
                    "origin": origin,
                    "date": today - timedelta(days=30),
                    "estimated_amount": amount,
                    "description": "<p>Raised from the site record for the "
                                   "demo commercial workflow.</p>",
                }
            )
        if boq and not event.change_order_ids:
            env["construction.change.order"].sudo().create(
                {
                    "name": title,
                    "project_id": primary.id,
                    "change_event_id": event.id,
                    "boq_id": boq.id,
                    "change_type": "addition",
                    "reason": "<p>%s</p>" % reason,
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
    floorplan = env["facility.floorplan"].sudo().search(
        [("name", "=", "Tower One — Level 3 Operations Plan"), ("location_id", "=", building.id)],
        limit=1,
    )
    if not floorplan:
        with file_open("facility_floorplan/demo/level3.pdf", "rb") as handle:
            floorplan = env["facility.floorplan"].sudo().create({
                "name": "Tower One — Level 3 Operations Plan",
                "location_id": building.id,
                "sheet_filename": "tower-one-level-3.pdf",
                "sheet_file": base64.b64encode(handle.read()),
                "note": "Synthetic floor plan for asset and work-order pin testing.",
            })
    pin_specs = [
        ("AHU-T1-01", "asset", 0.32, 0.28, assets[:1]),
        ("Reported ceiling leak", "note", 0.64, 0.55, env["maintenance.equipment"]),
    ]
    for name, pin_type, pos_x, pos_y, equipment in pin_specs:
        values = {
            "name": name,
            "floorplan_id": floorplan.id,
            "pin_type": pin_type,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "note": "Synthetic location-linked field observation.",
        }
        if equipment:
            values["equipment_id"] = equipment.id
        pin = env["facility.pin"].sudo().search(
            [("name", "=", name), ("floorplan_id", "=", floorplan.id)], limit=1
        )
        if not pin:
            env["facility.pin"].sudo().create(values)
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

    mapped = env["majal.document.template"].sudo().search(
        [("code", "=", "DEMO-HOT-WORKS-MAP"), ("company_id", "=", company.id)],
        limit=1,
    )
    with file_open("majal_document_intake/demo/client-hot-works-permit.pdf", "rb") as handle:
        source_pdf = base64.b64encode(handle.read())
    mapped_values = {
        "name": "Client Hot Works Permit — Mapped PDF",
        "code": "DEMO-HOT-WORKS-MAP",
        "company_id": company.id,
        "language": "en_US",
        "document_type": "inspection",
        "body_html": (
            "<h3>Client hot works permit</h3>"
            "<p>The source PDF is retained, previewed in Majal, mapped to "
            "reviewable form fields and filled again after inspection.</p>"
        ),
        "source_filename": "client-hot-works-permit.pdf",
        "source_file": source_pdf,
    }
    if mapped:
        mapped.write(mapped_values)
    else:
        mapped = env["majal.document.template"].sudo().create(mapped_values)
    if not mapped.mapped_form_template_id:
        mapped.action_map_source_document()
        if mapped.intake_upload_id.state == "parsed":
            mapped.intake_upload_id.action_apply()

    sign_request = env["majal.sign.request"].sudo().search(
        [
            ("document_id", "=", document.id),
            ("version_id", "=", document.current_version_id.id),
            ("signer_id", "=", users["admin"].id),
            ("state", "=", "pending"),
        ],
        limit=1,
    )
    if not sign_request:
        env["majal.sign.request"].sudo().create(
            {
                "document_id": document.id,
                "version_id": document.current_version_id.id,
                "signer_id": users["admin"].id,
                "requested_by_id": users["pm"].id,
                "note": "Demo signature request for the issued coordination letter.",
            }
        )


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
    property_company = _company(
        env,
        "Majal Demo Properties LLC",
        majal_trading_name="Majal Demo Properties",
        majal_registration_number="DEMO-RE-2026",
        majal_tax_registration_number="100000000000003",
        majal_document_email="property@demo.local",
        majal_document_phone="+971 4 555 0300",
        majal_document_address="Dubai, United Arab Emirates — Demo Environment",
    )

    owner = _user(
        env, "demo.owner@majal.local", "Demo Platform Owner",
        contracting, "platform_owner", "both"
    )
    owner.sudo().write(
        {"company_ids": [Command.set([contracting.id, facilities.id, property_company.id])]}
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
    property_users = {
        "director": _user(
            env, "demo.property.director@majal.local", "Demo Property Director",
            property_company, "operations_manager", "real_estate"
        ),
        "sales": _user(
            env, "demo.property.sales@majal.local", "Demo Property Sales Manager",
            property_company, "manager", "real_estate"
        ),
        "ops": _user(
            env, "demo.property.ops@majal.local", "Demo Property Operations",
            property_company, "manager", "property_facilities"
        ),
        "agent": _user(
            env, "demo.property.agent@majal.local", "Demo Property Agent",
            property_company, "field_user", "real_estate"
        ),
    }

    projects = _seed_construction(env, contracting, construction_users)
    _seed_facilities(env, facilities, facility_users)
    _seed_documents(env, contracting, projects[0], construction_users)
    _seed_approval_cycles(env, contracting, construction_users)
    seed_enterprise_demo(env)
    seed_property_demo(env, property_company, property_users)
    seed_spreadsheets(
        env,
        {
            "contracting": (contracting, construction_users["pm"] | construction_users["ops"]),
            "facilities": (facilities, facility_users["manager"] | facility_users["supervisor"]),
            "property": (property_company, property_users["director"] | property_users["sales"] | property_users["ops"]),
        },
    )
    all_user_ids = {
        user.id
        for user in (
            list(construction_users.values())
            + list(facility_users.values())
            + list(property_users.values())
        )
    }
    all_users = env["res.users"].browse(sorted(all_user_ids))
    _enable_demo_intelligence(
        env, contracting | facilities | property_company, all_users
    )
    env["res.users"].sudo()._majal_install_tenant_rules()
