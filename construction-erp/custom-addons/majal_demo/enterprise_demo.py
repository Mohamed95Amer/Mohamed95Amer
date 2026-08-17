"""Idempotent enterprise-scale construction demo for marketing and training.

This is intentionally separate from the small install-time demo. It can be
invoked on a staging database with::

    from odoo.addons.majal_demo.enterprise_demo import seed_enterprise_demo
    seed_enterprise_demo(env)

It never targets production automatically and every business record carries a
stable project code or marketing prefix so rerunning it fills gaps without
duplicating the portfolio.
"""

import base64
from datetime import datetime, time, timedelta

from odoo import Command, fields
from odoo.tools import file_open


VERSION = "2026.08.1"

PROJECTS = [
    ("New Cairo Financial District Tower", "MJL-NCFD", "building", "execution", 285_000_000, 62, 9, "New Cairo, Egypt"),
    ("Red Sea Luxury Resort", "MJL-RSLR", "building", "execution", 412_000_000, 44, 3, "Red Sea Coast, Saudi Arabia"),
    ("Dubai Metro Extension - Package C", "MJL-DMEC", "infrastructure", "execution", 620_000_000, 31, 14, "Dubai, United Arab Emirates"),
    ("Abu Dhabi Healthcare Campus", "MJL-ADHC", "building", "execution", 355_000_000, 78, 0, "Abu Dhabi, United Arab Emirates"),
    ("Alexandria Port Expansion", "MJL-APEX", "infrastructure", "mobilization", 198_000_000, 18, 5, "Alexandria, Egypt"),
    ("Riyadh Data Center Campus", "MJL-RDCC", "building", "execution", 245_000_000, 53, 7, "Riyadh, Saudi Arabia"),
    ("Muscat Smart Logistics Hub", "MJL-MSLH", "other", "execution", 172_000_000, 69, 0, "Muscat, Oman"),
    ("Doha Cultural District Fit-Out", "MJL-DCDF", "fitout", "handover", 86_000_000, 91, 2, "Doha, Qatar"),
]

TASKS = [
    "Mobilization and temporary facilities", "Survey control and setting out",
    "Bulk excavation and dewatering", "Foundations and substructure",
    "Structural frame", "Building envelope", "Mechanical services",
    "Electrical and ELV systems", "Internal partitions and ceilings",
    "Architectural finishes", "External works and landscaping",
    "Testing and commissioning", "Authority inspections",
    "Handover documentation and closeout",
]

BOQ_ITEMS = [
    ("01", "Preliminaries", "Project management, logistics and temporary works", .05, 1, None),
    ("02", "Earthworks", "Excavation, dewatering and disposal", .08, 85, "MKT-EARTH"),
    ("03", "Concrete", "Reinforced concrete frame", .18, 135, "MKT-CONC"),
    ("05", "Metals", "Reinforcement and structural steel", .12, 980, "MKT-STEEL"),
    ("08", "Envelope", "Facade, glazing and waterproofing", .10, 510, "MKT-GLASS"),
    ("09", "Finishes", "Partitions, ceilings and architectural finishes", .13, 260, "MKT-FINISH"),
    ("21", "Fire Protection", "Fire suppression and life-safety systems", .11, 1, None),
    ("22", "Plumbing", "Water, drainage and specialist plumbing", .09, 1, None),
    ("26", "Electrical", "Power, lighting, ELV and controls", .08, 1, None),
    ("33", "External Works", "Utilities, roads and landscape works", .06, 1, None),
]

PRODUCTS = [
    ("MKT-EARTH", "Selected fill material", 42.0),
    ("MKT-CONC", "Ready-mix concrete C40/50", 72.0),
    ("MKT-STEEL", "High-yield reinforcement steel", 610.0),
    ("MKT-GLASS", "Unitized facade panel", 285.0),
    ("MKT-FINISH", "Premium interior finish package", 145.0),
]


def _partner(env, company, name, email):
    record = env["res.partner"].sudo().search([
        ("name", "=", name), ("company_id", "=", company.id)
    ], limit=1)
    return record or env["res.partner"].sudo().create({
        "name": name, "company_type": "company", "company_id": company.id,
        "email": email,
    })


def _products(env, company):
    result = {}
    for code, name, cost in PRODUCTS:
        product = env["product.product"].sudo().search([
            ("default_code", "=", code)
        ], limit=1)
        if not product:
            product = env["product.product"].sudo().create({
                "name": name, "default_code": code, "type": "consu",
                "is_storable": True,
            })
        product.with_company(company).standard_price = cost
        result[code] = product
    return result


def _project(env, company, users, client, consultant, spec):
    name, code, project_type, stage, value, progress, slip, address = spec
    project = env["project.project"].sudo().search([
        ("project_code", "=", code), ("company_id", "=", company.id)
    ], limit=1)
    today = fields.Date.today()
    values = {
        "name": name, "project_code": code, "company_id": company.id,
        "is_construction": True, "project_type": project_type,
        "construction_stage": stage, "client_id": client.id,
        "consultant_id": consultant.id, "main_contractor_id": company.partner_id.id,
        "site_address": address, "contract_value": value,
        "date_commencement": today - timedelta(days=int(progress * 5.2)),
        "date_completion_planned": today + timedelta(days=max(40, int((100 - progress) * 6.2))),
        "majal_manager_id": users["pm"].id,
        "majal_member_ids": [Command.set([
            users["ops"].id, users["pm"].id, users["engineer"].id,
            users["field"].id,
        ])],
    }
    if project:
        project.write(values)
    else:
        project = env["project.project"].sudo().create(values)
    return project, progress, slip


def _programme(env, project, users, progress, slip):
    today = fields.Date.today()
    start = project.date_commencement or today - timedelta(days=180)
    records = []
    for index, name in enumerate(TASKS, 1):
        task = env["project.task"].sudo().search([
            ("project_id", "=", project.id), ("name", "=", name)
        ], limit=1)
        planned_start = datetime.combine(start + timedelta(days=(index - 1) * 28), time(7, 0))
        planned_finish = planned_start + timedelta(days=34)
        baseline_finish = planned_finish - timedelta(days=slip if index in (5, 6, 7) else 0)
        task_progress = max(0, min(100, progress + (7 - index) * 8))
        values = {
            "name": name, "project_id": project.id, "wbs_code": f"{index:02d}.00",
            "planned_start": planned_start, "planned_finish": planned_finish,
            "baseline_start": planned_start, "baseline_finish": baseline_finish,
            "planned_duration": 25, "progress": task_progress,
            "is_critical": index in (4, 5, 6, 7, 12, 14),
            "is_milestone": index in (13, 14),
            "state": "1_done" if task_progress >= 100 else "01_in_progress",
            "user_ids": [Command.set([
                users["pm"].id if index in (1, 13, 14) else
                users["engineer"].id if index % 2 else users["field"].id
            ])],
            "date_deadline": planned_finish.date(),
        }
        if task:
            task.write(values)
        else:
            task = env["project.task"].sudo().create(values)
        records.append(task)
    for predecessor, successor in zip(records, records[1:]):
        if not env["construction.task.link"].sudo().search([
            ("predecessor_id", "=", predecessor.id),
            ("successor_id", "=", successor.id),
        ], limit=1):
            env["construction.task.link"].sudo().create({
                "predecessor_id": predecessor.id,
                "successor_id": successor.id,
                "link_type": "FS", "lag_days": 0,
            })
    return records


def _boq(env, project, products, contract_value):
    boq = env["construction.boq"].sudo().search([
        ("project_id", "=", project.id), ("name", "=", "Enterprise Cost Plan")
    ], limit=1)
    if boq:
        return boq
    boq = env["construction.boq"].sudo().create({
        "name": "Enterprise Cost Plan", "project_id": project.id,
    })
    unit = env.ref("uom.product_uom_unit")
    for sequence, (code, section_name, description, weight, sell_rate, product_code) in enumerate(BOQ_ITEMS, 1):
        section = env["construction.boq.section"].sudo().create({
            "boq_id": boq.id, "sequence": sequence * 10,
            "code": code, "name": section_name,
        })
        line_value = contract_value * weight
        quantity = line_value / sell_rate
        cost_rate = sell_rate * (0.82 + (sequence % 3) * .015)
        env["construction.boq.line"].sudo().create({
            "boq_id": boq.id, "section_id": section.id,
            "item_code": f"{code}.100", "name": description,
            "uom_id": unit.id, "quantity": quantity, "unit_rate": sell_rate,
            "product_id": products[product_code].id if product_code else False,
            "cost_material": cost_rate * .34,
            "cost_labour": cost_rate * .22,
            "cost_equipment": cost_rate * .12,
            "cost_subcontract": cost_rate * .24,
            "cost_overhead": cost_rate * .08,
        })
    boq.write({"state": "locked"})
    return boq


def _commercial(env, project, boq, partners, progress, risk_index):
    subcontractors = partners["subcontractors"]
    trades = ["Concrete frame", "Facade", "MEP services", "Architectural finishes"]
    scope_lines = [boq.line_ids[2], boq.line_ids[4], boq.line_ids[6], boq.line_ids[5]]
    created_subcontracts = []
    overrun = 1.12 if risk_index in (2, 5) else .96
    for index, (trade, line) in enumerate(zip(trades, scope_lines)):
        name = f"{project.project_code} - {trade} subcontract"
        subcontract = env["construction.subcontract"].sudo().search([
            ("project_id", "=", project.id), ("name", "=", name)
        ], limit=1)
        if not subcontract:
            subcontract = env["construction.subcontract"].sudo().create({
                "name": name, "project_id": project.id,
                "subcontractor_id": subcontractors[index % len(subcontractors)].id,
                "trade": trade, "description": f"Full {trade.lower()} package including testing and closeout.",
                "date_start": project.date_commencement,
                "date_end": project.date_completion_planned,
                "retention_percent": 10, "retention_cap_percent": 5,
                "line_ids": [Command.create({
                    "name": line.name, "boq_line_id": line.id,
                    "uom_id": line.uom_id.id, "quantity": line.quantity,
                    "unit_rate": line.unit_cost * overrun,
                })],
                "state": "confirmed",
            })
        created_subcontracts.append(subcontract)

    claim = env["construction.progress.claim"].sudo().search([
        ("project_id", "=", project.id), ("name", "=", "Enterprise IPC 01")
    ], limit=1)
    if not claim:
        claim = env["construction.progress.claim"].sudo().create({
            "name": "Enterprise IPC 01", "project_id": project.id,
            "boq_id": boq.id, "date_from": project.date_commencement,
            "date_to": fields.Date.today(), "retention_percent": 10,
            "retention_cap_percent": 5,
        })
        for line in claim.line_ids:
            line.qty_this_period = line.qty_contract * progress / 100.0
        claim.write({"state": "certified"})

    tender = env["construction.tender"].sudo().search([
        ("project_id", "=", project.id), ("name", "=", "Facade and envelope tender")
    ], limit=1)
    if not tender:
        target = boq.line_ids[4]
        tender = env["construction.tender"].sudo().create({
            "name": "Facade and envelope tender", "project_id": project.id,
            "trade": "Facade", "description": "Design, supply, installation, testing and warranty.",
            "boq_id": boq.id, "closing_date": fields.Datetime.now() - timedelta(days=20),
            "line_ids": [Command.create({
                "boq_line_id": target.id, "name": target.name,
                "quantity": target.quantity, "uom_id": target.uom_id.id,
            })],
        })
        bids = []
        for bid_index, bidder in enumerate(subcontractors[:3]):
            bid = env["construction.tender.bid"].sudo().create({
                "tender_id": tender.id, "bidder_id": bidder.id,
                "state": "submitted", "submitted_on": fields.Datetime.now() - timedelta(days=25 - bid_index),
                "lead_time_days": 45 + bid_index * 10, "validity_days": 120,
                "notes": ("Fully compliant technical offer" if bid_index == 0 else
                          "Alternative specification with extended warranty"),
                "line_ids": [Command.create({
                    "tender_line_id": tender.line_ids[0].id,
                    "unit_rate": target.unit_cost * (.91 + bid_index * .055),
                })],
            })
            bids.append(bid)
        bids[0].state = "awarded"
        tender.write({
            "state": "awarded", "awarded_bid_id": bids[0].id,
            "subcontract_id": created_subcontracts[1].id,
        })
    return claim


def _site_records(env, project, users, partners, boq, progress, risk_index):
    today = fields.Date.today()
    contractor = partners["subcontractors"][risk_index % len(partners["subcontractors"])]
    for offset in range(14):
        log_date = today - timedelta(days=offset)
        log = env["construction.daily.log"].sudo().search([
            ("project_id", "=", project.id), ("log_date", "=", log_date)
        ], limit=1)
        if log:
            continue
        headcount = 68 + risk_index * 11 + (offset % 5) * 7
        delay = (offset % 6 == 0 and risk_index in (2, 4, 5))
        env["construction.daily.log"].sudo().create({
            "project_id": project.id, "log_date": log_date,
            "prepared_by_id": users["field"].id,
            "weather": ("sunny", "hot", "windy", "cloudy")[offset % 4],
            "temperature": 29 + (offset % 8), "state": "approved",
            "notes": "Morning coordination completed; permits, access routes and quality hold points reviewed.",
            "manpower_ids": [
                Command.create({"trade": "Civil and structural crew", "contractor_id": contractor.id, "headcount": headcount, "hours": 10}),
                Command.create({"trade": "MEP installation crew", "contractor_id": contractor.id, "headcount": int(headcount * .55), "hours": 9}),
                Command.create({"trade": "QA/QC and HSE supervision", "headcount": 12, "hours": 10}),
            ],
            "equipment_ids": [
                Command.create({"name": "Tower crane", "quantity": 2, "hours": 9}),
                Command.create({"name": "Mobile concrete pump", "quantity": 1, "hours": 6}),
            ],
            "activity_ids": [
                Command.create({"description": TASKS[min(4 + offset % 5, len(TASKS) - 1)], "location": f"Zone {chr(65 + offset % 4)} / Level {3 + offset % 12:02d}", "boq_line_id": boq.line_ids[min(2 + offset % 6, 8)].id}),
                Command.create({"description": "Inspection, testing and consultant coordination", "location": f"Workfront {1 + offset % 5}"}),
            ],
            "delay_ids": [Command.create({
                "cause": "Late coordinated design response", "category": "design", "hours_lost": 3.5,
            })] if delay else [],
        })

    for index in range(1, 6):
        name = f"{project.project_code}-SNAG-{index:03d}"
        if not env["construction.defect"].sudo().search([
            ("project_id", "=", project.id), ("name", "=", name)
        ], limit=1):
            state = ("closed", "open", "in_progress", "ready", "closed")[index - 1]
            env["construction.defect"].sudo().create({
                "name": name, "project_id": project.id,
                "description": ("Facade sealant discontinuity at movement joint" if index == 1 else
                                "Workmanship observation raised during coordinated inspection."),
                "location": f"Level {5 + index:02d} - Zone {chr(64 + index)}",
                "severity": ("low", "medium", "high", "critical", "medium")[index - 1],
                "state": state, "assigned_user_id": users["engineer"].id,
                "responsible_subcontractor_id": contractor.id,
                "date_required": today + timedelta(days=index - 3),
            })
    for index in range(1, 4):
        name = f"{project.project_code}-RFI-{index:03d}"
        if not env["construction.rfi"].sudo().search([
            ("project_id", "=", project.id), ("name", "=", name)
        ], limit=1):
            env["construction.rfi"].sudo().create({
                "name": name, "project_id": project.id,
                "question": "<p>Confirm coordinated builder's-work opening and interface detail before release.</p>",
                "discipline": ("structural", "mep", "architectural")[index - 1],
                "ball_in_court_id": partners["consultant"].id,
                "date_required": today - timedelta(days=2) if index == 1 and risk_index % 2 else today + timedelta(days=index * 3),
                "raised_by_id": users["engineer"].id,
                "state": "submitted" if index < 3 else "closed",
            })

    incident_name = f"{project.project_code} - Near miss: unsecured access panel"
    if not env["construction.incident"].sudo().search([
        ("project_id", "=", project.id), ("name", "=", incident_name)
    ], limit=1):
        env["construction.incident"].sudo().create({
            "name": incident_name, "project_id": project.id,
            "occurred_on": fields.Datetime.now() - timedelta(days=8 + risk_index),
            "reported_by_id": users["field"].id, "location": "Active logistics route",
            "contractor_id": contractor.id, "incident_class": "near_miss",
            "severity": "medium", "description": "Access panel was found unsecured before the lifting route opened.",
            "immediate_action": "Route isolated and panel secured; briefing completed before work resumed.",
            "root_cause": "Temporary works handover check was not recorded at shift change.",
            "investigator_id": users["ops"].id, "state": "actions",
            "action_ids": [
                Command.create({"name": "Introduce signed shift-handover checklist", "responsible_id": users["engineer"].id, "deadline": today + timedelta(days=2), "done": False}),
                Command.create({"name": "Brief all logistics marshals", "responsible_id": users["field"].id, "deadline": today - timedelta(days=1), "done": True}),
            ],
        })


def _materials(env, company, project, products, boq, partner, risk_index):
    project.ensure_site_location()
    source = project.site_location_id
    destination = env["stock.location"].sudo().search([
        ("name", "=", "Enterprise Site Consumption"),
        ("company_id", "=", company.id), ("usage", "=", "inventory"),
    ], limit=1)
    if not destination:
        destination = env["stock.location"].sudo().create({
            "name": "Enterprise Site Consumption", "usage": "inventory",
            "company_id": company.id,
        })
    product_lines = boq.line_ids.filtered("product_id")[:3]
    issue_name = f"{project.project_code} - Weekly material issue"
    issue = env["construction.material.issue"].sudo().search([
        ("project_id", "=", project.id), ("name", "=", issue_name)
    ], limit=1)
    if not issue:
        issue = env["construction.material.issue"].sudo().create({
            "name": issue_name, "project_id": project.id,
            "issued_to_id": partner.id, "issue_date": fields.Date.today() - timedelta(days=2),
            "note": "Approved weekly allocation to active work fronts.",
            "line_ids": [Command.create({
                "product_id": line.product_id.id, "boq_line_id": line.id,
                "quantity": max(25, line.quantity * (.018 + risk_index * .001)),
            }) for line in product_lines],
        })
        for line in issue.line_ids:
            move = env["stock.move"].sudo().create({
                "name": f"{project.project_code}: {line.product_id.display_name}",
                "product_id": line.product_id.id,
                "product_uom_qty": line.quantity, "product_uom": line.uom_id.id,
                "location_id": source.id, "location_dest_id": destination.id,
                "company_id": company.id, "construction_issue_id": issue.id,
            })
            move._action_confirm()
            move.write({"state": "done", "quantity": line.quantity})
        issue.state = "done"


def _bim(env, project, users, boq):
    model = env["construction.bim.model"].sudo().search([
        ("project_id", "=", project.id),
        ("name", "=", "Tower A - Federated Coordination Model"),
    ], limit=1)
    if not model:
        with file_open("construction_bim/static/demo/majal-mega-campus.ifc", "rb") as handle:
            payload = handle.read()
        model = env["construction.bim.model"].sudo().create({
            "name": "Tower A - Federated Coordination Model",
            "project_id": project.id, "discipline": "federated", "revision": "C",
            "ifc_filename": "majal-mega-campus.ifc",
            "ifc_file": base64.b64encode(payload),
        })
        model.action_index()
        model.action_make_current()
    elements = model.element_ids.sorted(lambda record: (record.storey, record.step_id))
    tasks = env["project.task"].sudo().search([
        ("project_id", "=", project.id)
    ], order="wbs_code, id")
    rfis = env["construction.rfi"].sudo().search([
        ("project_id", "=", project.id)
    ], order="id")
    defects = env["construction.defect"].sudo().search([
        ("project_id", "=", project.id)
    ], order="id")
    for index, element in enumerate(elements[:36]):
        values = {"task_id": tasks[index % len(tasks)].id}
        if index < len(boq.line_ids):
            values["boq_line_id"] = boq.line_ids[index].id
        if index < len(rfis):
            values["rfi_id"] = rfis[index].id
        if 8 <= index < 8 + len(defects):
            values["defect_id"] = defects[index - 8].id
        element.write(values)
    for index, (pin_type, record) in enumerate([
        ("rfi", rfis[:1]), ("defect", defects[:1]), ("task", tasks[4:5]),
    ], 1):
        if not record:
            continue
        element = elements[(index - 1) * 8]
        name = f"Coordination pin {index:02d} - {record.display_name}"
        if not env["construction.bim.pin"].sudo().search([
            ("model_id", "=", model.id), ("name", "=", name)
        ], limit=1):
            env["construction.bim.pin"].sudo().create({
                "model_id": model.id, "element_id": element.id,
                "global_id": element.global_id, "name": name,
                "note": "Marketing demo viewpoint linked to the live project workflow.",
                "pos_x": 3 + index * 4, "pos_y": 5 - index, "pos_z": 4.2 * index,
                "cam_x": 42, "cam_y": 36, "cam_z": 30,
                "cam_target_x": 0, "cam_target_y": 0, "cam_target_z": 12,
                "storey": element.storey, "pin_type": pin_type,
                f"{pin_type}_id": record.id,
                "author_id": users["engineer"].id,
            })
    return model


def seed_enterprise_demo(env):
    company = env["res.company"].sudo().search([
        ("name", "=", "Majal Demo Contracting LLC")
    ], limit=1)
    if not company:
        raise RuntimeError("Install majal_demo before the enterprise marketing dataset.")
    users = {
        key: env["res.users"].sudo().search([("login", "=", login)], limit=1)
        for key, login in {
            "owner": "demo.owner@majal.local", "ops": "demo.ops@majal.local",
            "pm": "demo.pm@majal.local", "engineer": "demo.engineer@majal.local",
            "field": "demo.field@majal.local",
        }.items()
    }
    if any(not user for user in users.values()):
        raise RuntimeError("The Majal role-based demo users are incomplete.")

    client = _partner(env, company, "Majal Global Developments", "projects@majal-demo.local")
    consultant = _partner(env, company, "Vertex Engineering Consultants", "pmc@majal-demo.local")
    subcontractors = [
        _partner(env, company, name, f"tenders{index}@majal-demo.local")
        for index, name in enumerate([
            "Nile Structures International", "Apex Facades and Envelope",
            "Gulf Integrated MEP", "Precision Interiors Group",
            "Horizon Civil Infrastructure", "SafeBuild Specialist Systems",
        ], 1)
    ]
    partners = {
        "client": client, "consultant": consultant,
        "subcontractors": subcontractors,
    }
    products = _products(env, company)
    projects = []
    total_tasks = total_logs = 0
    for risk_index, spec in enumerate(PROJECTS):
        project, progress, slip = _project(
            env, company, users, client, consultant, spec
        )
        tasks = _programme(env, project, users, progress, slip)
        boq = _boq(env, project, products, spec[4])
        _commercial(env, project, boq, partners, progress, risk_index)
        _site_records(env, project, users, partners, boq, progress, risk_index)
        _materials(env, company, project, products, boq, subcontractors[0], risk_index)
        projects.append(project)
        total_tasks += len(tasks)
        total_logs += 14

    bim = _bim(env, projects[0], users, env["construction.boq"].sudo().search([
        ("project_id", "=", projects[0].id), ("name", "=", "Enterprise Cost Plan")
    ], limit=1))
    env["ir.config_parameter"].sudo().set_param(
        "majal.enterprise_demo.version", VERSION
    )
    env.cr.commit()
    return {
        "version": VERSION, "projects": len(projects), "tasks": total_tasks,
        "daily_logs": total_logs, "bim_model_id": bim.id,
        "bim_elements": bim.element_count, "bim_linked": bim.linked_count,
    }
