"""Idempotent enterprise facilities-management dataset for demos and training.

Run from an Odoo shell after ``majal_demo`` is installed::

    from odoo.addons.majal_demo.enterprise_facilities_demo import seed_enterprise_facilities_demo
    seed_enterprise_facilities_demo(env)
"""

import base64
from datetime import timedelta

from odoo import Command, fields
from odoo.tools.misc import file_open


VERSION = "2026.08.3"


SITE_SPECS = [
    ("DXB-EST", "Dubai Downtown Mixed-Use Estate", "Dubai", 124_000_000),
    ("AUH-HC", "Capital Healthcare Campus", "Abu Dhabi", 168_000_000),
    ("CAI-CP", "New Cairo Corporate Park", "New Cairo", 96_000_000),
    ("RSH-HO", "Red Sea Hospitality Portfolio", "Red Sea", 142_000_000),
]

BUILDING_NAMES = [
    ("A", "Operations Tower"),
    ("B", "Services & Experience Centre"),
]

ASSET_TYPES = [
    ("HVAC", "Water-Cooled Chiller", "critical", "Running Hours", "h", 860_000, 20),
    ("HVAC", "Primary Chilled Water Pump", "high", "Running Hours", "h", 120_000, 12),
    ("HVAC", "Air Handling Unit", "high", "Running Hours", "h", 185_000, 15),
    ("HVAC", "Fresh Air Handling Unit", "high", "Running Hours", "h", 132_000, 15),
    ("Electrical", "11kV Transformer", "critical", "Energy", "kWh", 640_000, 25),
    ("Electrical", "Main LV Switchboard", "critical", "Energy", "kWh", 410_000, 25),
    ("Electrical", "Emergency Generator", "critical", "Running Hours", "h", 390_000, 20),
    ("Electrical", "UPS System", "high", "Battery Cycles", "cycles", 210_000, 12),
    ("Vertical Transport", "Passenger Lift", "critical", "Trips", "cycles", 310_000, 20),
    ("Vertical Transport", "Service Lift", "high", "Trips", "cycles", 285_000, 20),
    ("Fire & Life Safety", "Fire Alarm Control Panel", "critical", "Tests", "cycles", 98_000, 15),
    ("Fire & Life Safety", "Sprinkler Pump Set", "critical", "Running Hours", "h", 175_000, 18),
    ("Water Systems", "Domestic Water Booster", "high", "Running Hours", "h", 74_000, 12),
    ("Water Systems", "Sewage Transfer Pump", "high", "Running Hours", "h", 68_000, 10),
    ("Security", "CCTV Recording Platform", "medium", "Running Hours", "h", 82_000, 8),
    ("Security", "Access Control Panel", "medium", "Door Cycles", "cycles", 56_000, 10),
    ("BMS & Controls", "BMS Automation Controller", "high", "Running Hours", "h", 44_000, 10),
    ("BMS & Controls", "Energy Meter Gateway", "medium", "Energy", "kWh", 38_000, 10),
    ("Building Fabric", "Automatic Entrance Door", "medium", "Door Cycles", "cycles", 46_000, 12),
    ("Building Fabric", "Roof Access System", "low", "Inspections", "cycles", 24_000, 15),
]


def _valid(model, values):
    """Keep the dataset portable across the supported module variants."""
    return {key: value for key, value in values.items() if key in model._fields}


def _one(model, domain, values):
    record = model.sudo().search(domain, limit=1)
    clean_values = _valid(model, values)
    if record:
        # A repeatable demo seed must converge old data on the current model,
        # not merely avoid duplicates. This also lets the seed safely repair
        # role assignments introduced by later product versions.
        record.sudo().write(clean_values)
        return record
    return model.sudo().create(clean_values)


def _users(env):
    logins = {
        "owner": "demo.owner@majal.local",
        "manager": "demo.fm.manager@majal.local",
        "supervisor": "demo.fm.supervisor@majal.local",
        "tech": "demo.tech@majal.local",
    }
    return {
        key: env["res.users"].sudo().search([("login", "=", login)], limit=1)
        for key, login in logins.items()
    }


def _locations(env, company, users):
    location_model = env["facility.location"]
    result = []
    for site_code, site_name, city, portfolio_value in SITE_SPECS:
        client = _one(
            env["res.partner"],
            [("name", "=", f"{site_name} Owner")],
            {
                "name": f"{site_name} Owner",
                "company_type": "company",
                "city": city,
                "email": f"fm.{site_code.lower()}@demo.local",
            },
        )
        site = _one(
            location_model,
            [("code", "=", site_code), ("company_id", "=", company.id)],
            {
                "name": site_name,
                "code": site_code,
                "location_type": "site",
                "company_id": company.id,
                "manager_user_id": users["manager"].id,
                "member_user_ids": [Command.set([users["supervisor"].id, users["tech"].id])],
            },
        )
        for building_index, (suffix, building_name) in enumerate(BUILDING_NAMES, start=1):
            code = f"{site_code}-{suffix}"
            building = _one(
                location_model,
                [("code", "=", code), ("company_id", "=", company.id)],
                {
                    "name": building_name,
                    "code": code,
                    "location_type": "building",
                    "parent_id": site.id,
                    "company_id": company.id,
                    "manager_user_id": users["manager"].id,
                    "member_user_ids": [Command.set([users["supervisor"].id, users["tech"].id])],
                },
            )
            floors = []
            for floor_number, floor_name in enumerate(("Ground Floor", "Level 01", "Level 02")):
                floor_code = f"{code}-L{floor_number:02d}"
                floor = _one(
                    location_model,
                    [("code", "=", floor_code), ("company_id", "=", company.id)],
                    {
                        "name": floor_name,
                        "code": floor_code,
                        "location_type": "floor",
                        "parent_id": building.id,
                        "company_id": company.id,
                        "manager_user_id": users["supervisor"].id,
                        "member_user_ids": [Command.set([
                            users["manager"].id,
                            users["tech"].id,
                        ])],
                    },
                )
                floors.append(floor)
                for zone_index, zone_name in enumerate(("Public & Tenant Zone", "Plant & Service Zone"), start=1):
                    zone_code = f"{floor_code}-Z{zone_index}"
                    _one(
                        location_model,
                        [("code", "=", zone_code), ("company_id", "=", company.id)],
                        {
                            "name": zone_name,
                            "code": zone_code,
                            "location_type": "zone",
                            "parent_id": floor.id,
                            "company_id": company.id,
                            "manager_user_id": users["supervisor"].id,
                            "member_user_ids": [Command.set([
                                users["manager"].id,
                                users["tech"].id,
                            ])],
                        },
                    )
            result.append({
                "site": site,
                "building": building,
                "floors": floors,
                "client": client,
                "portfolio_value": portfolio_value,
                "index": building_index,
            })
    return result


def _categories_and_team(env, company):
    categories = {}
    for category_name in sorted({item[0] for item in ASSET_TYPES}):
        categories[category_name] = _one(
            env["maintenance.equipment.category"],
            [("name", "=", f"Majal FM - {category_name}")],
            {"name": f"Majal FM - {category_name}"},
        )
    team = _one(
        env["maintenance.team"],
        [("name", "=", "Majal Enterprise FM Command")],
        {"name": "Majal Enterprise FM Command", "company_id": company.id},
    )
    return categories, team


def _assets(env, company, locations, categories, team, users):
    asset_model = env["maintenance.equipment"]
    assets = []
    today = fields.Date.context_today(asset_model)
    for building_number, bundle in enumerate(locations, start=1):
        for type_number, asset_type in enumerate(ASSET_TYPES, start=1):
            category_name, label, criticality, meter_name, unit, value, life = asset_type
            barcode = f"MAJ-FM-{building_number:02d}-{type_number:03d}"
            asset = asset_model.sudo().search([("barcode", "=", barcode)], limit=1)
            floor = bundle["floors"][(type_number - 1) % len(bundle["floors"])]
            values = _valid(asset_model, {
                "name": f"{label} {bundle['building'].code}-{type_number:02d}",
                "company_id": company.id,
                "category_id": categories[category_name].id,
                "maintenance_team_id": team.id,
                "technician_user_id": users["tech"].id,
                "owner_user_id": users["manager"].id,
                "facility_location_id": floor.id,
                "criticality": criticality,
                "barcode": barcode,
                "nfc_uid": f"04-A7-{building_number:02X}-{type_number:04X}",
                "purchase_value": value + building_number * 7_500,
                "expected_life_years": life,
                "warranty_date": today + timedelta(days=120 + type_number * 19),
                "assign_date": today - timedelta(days=500 + type_number * 13),
                "portal_selectable": True,
            })
            if asset:
                # Demo seeds are also repair tools. Earlier versions created
                # these rows before portfolio ownership was added; reconciling
                # the managed fields makes reruns genuinely idempotent and
                # keeps the Facility Manager's assignment-based view complete.
                asset.sudo().write(values)
            else:
                asset = asset_model.sudo().create(values)
            assets.append({"asset": asset, "bundle": bundle, "meter_name": meter_name, "unit": unit})
    return assets


def _meters_and_scans(env, assets, users):
    today = fields.Date.context_today(env["facility.asset.meter"])
    now = fields.Datetime.now()
    reading_total = 0
    scan_total = 0
    for index, entry in enumerate(assets, start=1):
        asset = entry["asset"]
        meter = _one(
            env["facility.asset.meter"],
            [("equipment_id", "=", asset.id), ("name", "=", entry["meter_name"])],
            {"name": entry["meter_name"], "equipment_id": asset.id, "uom": entry["unit"]},
        )
        base = 2_500 + index * 173
        for reading_index, days_ago in enumerate((90, 60, 30, 0)):
            reading_date = today - timedelta(days=days_ago)
            if not env["facility.asset.meter.reading"].sudo().search([
                ("meter_id", "=", meter.id), ("date", "=", reading_date)
            ], limit=1):
                env["facility.asset.meter.reading"].sudo().create({
                    "meter_id": meter.id,
                    "date": reading_date,
                    "value": base + reading_index * (95 + index % 17),
                    "user_id": users["tech"].id,
                })
            reading_total += 1
        for scan_index, source in enumerate(("qr", "nfc")):
            scanned_at = now - timedelta(days=(index + scan_index * 11) % 45, hours=scan_index * 3)
            if not env["facility.asset.scan"].sudo().search([
                ("equipment_id", "=", asset.id), ("source", "=", source)
            ], limit=1):
                env["facility.asset.scan"].sudo().create({
                    "equipment_id": asset.id,
                    "scanned_at": scanned_at,
                    "user_id": users["tech"].id,
                    "source": source,
                    "facility_location_id": asset.facility_location_id.id,
                })
            scan_total += 1
        asset.sudo().write(_valid(asset, {
            "last_scan_at": now - timedelta(days=index % 5),
            "last_scan_user_id": users["tech"].id,
            "last_scan_source": "nfc" if index % 2 else "qr",
        }))
    return reading_total, scan_total


def _job_plans_and_failures(env):
    job_specs = [
        ("Critical HVAC quarterly service", 6.0, ["Permit and isolate", "Check vibration and temperatures", "Clean strainers and coils", "Record readings", "Functional test and handback"]),
        ("Electrical thermographic inspection", 4.5, ["Review single-line diagram", "Inspect protective devices", "Capture thermography", "Torque sample terminals", "Issue condition report"]),
        ("Life-safety monthly test", 3.0, ["Notify occupants", "Test cause and effect", "Inspect panel events", "Verify remote monitoring", "Reset and sign off"]),
        ("Lift planned maintenance", 5.0, ["Place lift out of service", "Inspect machine room", "Check doors and safety edges", "Run ride-quality test", "Return to service"]),
        ("Water-system hygiene visit", 4.0, ["Review water readings", "Inspect pumps and vessels", "Clean sample points", "Take quality sample", "Update compliance log"]),
        ("BMS controls health check", 3.5, ["Review active alarms", "Validate sensors", "Check control loops", "Back up controller", "Close stale alarms"]),
    ]
    plans = []
    for name, duration, tasks in job_specs:
        plan = env["facility.job.plan"].sudo().search([("name", "=", name)], limit=1)
        if not plan:
            plan = env["facility.job.plan"].sudo().create({
                "name": name,
                "description": "Majal enterprise standard job plan with controlled safety and completion evidence.",
                "estimated_duration": duration,
                "task_ids": [Command.create({"sequence": (i + 1) * 10, "name": task}) for i, task in enumerate(tasks)],
            })
        plans.append(plan)
    failures = {}
    failure_specs = {
        "problem": [("P01", "No output"), ("P02", "High temperature"), ("P03", "Abnormal vibration"), ("P04", "Communication alarm")],
        "cause": [("C01", "Component wear"), ("C02", "Loose connection"), ("C03", "Blocked flow"), ("C04", "Control configuration")],
        "remedy": [("R01", "Replace component"), ("R02", "Clean and recommission"), ("R03", "Tighten and test"), ("R04", "Restore configuration")],
    }
    for failure_type, items in failure_specs.items():
        failures[failure_type] = []
        for code, name in items:
            failures[failure_type].append(_one(
                env["facility.failure.code"],
                [("code", "=", f"MJL-{code}"), ("failure_type", "=", failure_type)],
                {"name": name, "code": f"MJL-{code}", "failure_type": failure_type},
            ))
    return plans, failures


def _sla_policies(env, company):
    specs = [
        (1, "Critical systems - 24/7 response", "3", "critical", 1.0, 4.0, 0.65),
        (5, "High-priority technical response", "3", False, 2.0, 8.0, 0.75),
        (10, "Standard corrective maintenance", False, False, 4.0, 24.0, 0.80),
        (50, "Planned maintenance commitment", False, False, 24.0, 72.0, 0.85),
    ]
    policies = []
    for sequence, name, priority, criticality, response, resolution, risk in specs:
        policies.append(_one(
            env["facility.sla.policy"],
            [("name", "=", name), ("company_id", "=", company.id)],
            {
                "name": name,
                "sequence": sequence,
                "company_id": company.id,
                "priority": priority,
                "criticality": criticality,
                "response_hours": response,
                "resolution_hours": resolution,
                "at_risk_ratio": risk,
            },
        ))
    return policies


def _contracts(env, company, locations, assets, policies):
    """Create one commercially credible maintenance agreement per estate."""
    today = fields.Date.context_today(env["contract.contract"])
    service = _one(
        env["product.product"],
        [("default_code", "=", "MJL-FM-AMC-001")],
        {
            "name": "Majal integrated facilities management service",
            "default_code": "MJL-FM-AMC-001",
            "type": "service",
            "list_price": 185_000.0,
        },
    )
    contracts = []
    for index, site_spec in enumerate(SITE_SPECS):
        site_code = site_spec[0]
        bundles = [bundle for bundle in locations if bundle["site"].code == site_code]
        client = bundles[0]["client"]
        site_assets = [
            entry["asset"] for entry in assets
            if entry["bundle"]["site"].code == site_code
        ]
        name = f"MJL-AMC-{site_code} - Integrated FM Agreement"
        contract = env["contract.contract"].sudo().search([
            ("name", "=", name), ("company_id", "=", company.id)
        ], limit=1)
        if not contract:
            start = today - timedelta(days=100 + index * 21)
            contract = env["contract.contract"].sudo().create(_valid(
                env["contract.contract"],
                {
                    "name": name,
                    "company_id": company.id,
                    "partner_id": client.id,
                    "contract_type": "sale",
                    "line_recurrence": False,
                    "is_amc": True,
                    "sla_policy_id": policies[index % len(policies)].id,
                    "covers_preventive": True,
                    "covers_corrective": index != 3,
                    "covers_parts": index in (0, 1),
                    "pm_visits_included": 240,
                    "renewal_notice_days": 90,
                    "equipment_ids": [Command.set([asset.id for asset in site_assets])],
                    "date_start": start,
                    "recurring_next_date": today + timedelta(days=15 + index * 4),
                    "date_end": today + timedelta(days=(42 if index == 1 else 250 + index * 65)),
                    "contract_line_ids": [Command.create({
                        "product_id": service.id,
                        "name": f"Monthly integrated FM service - {site_spec[1]}",
                        "quantity": 1.0,
                        "price_unit": 185_000.0 + index * 35_000,
                        "date_start": start,
                        "recurring_next_date": today + timedelta(days=15 + index * 4),
                    })],
                },
            ))
        contracts.append(contract)
    return contracts


def _preventive_plans(env, assets, team, job_plans):
    today = fields.Date.context_today(env["facility.pm.plan"])
    count = 0
    for index, entry in enumerate(assets, start=1):
        asset = entry["asset"]
        name = f"PM-{asset.barcode} - Planned Service"
        if not env["facility.pm.plan"].sudo().search([("name", "=", name)], limit=1):
            env["facility.pm.plan"].sudo().create({
                "name": name,
                "equipment_id": asset.id,
                "maintenance_team_id": team.id,
                "job_plan_id": job_plans[(index - 1) % len(job_plans)].id,
                "trigger_type": "calendar",
                "interval_number": 1 if asset.criticality == "critical" else 3,
                "interval_type": "months",
                "next_date": today + timedelta(days=-(index % 17) if index % 5 == 0 else 7 + index % 75),
            })
        count += 1
    return count


def _work_orders(env, company, assets, team, users, job_plans, failures):
    request_model = env["maintenance.request"]
    stages = env["maintenance.stage"].sudo().search([], order="sequence, id")
    open_stage = stages[:1]
    done_stage = stages.filtered("done")[-1:] or stages[-1:]
    today = fields.Date.context_today(request_model)
    now = fields.Datetime.now()
    count = 0
    for asset_index, entry in enumerate(assets, start=1):
        asset = entry["asset"]
        for visit in range(2):
            sequence = (asset_index - 1) * 2 + visit + 1
            preventive = visit == 0
            title = (
                f"MJL-FM-WO-{sequence:04d} - "
                f"{'Planned service' if preventive else 'Condition alarm'} - {asset.name}"
            )
            request = request_model.sudo().search([
                ("name", "=", title), ("company_id", "=", company.id)
            ], limit=1)
            if not request:
                is_done = sequence % 4 == 0
                vals = {
                    "name": title,
                    "company_id": company.id,
                    "equipment_id": asset.id,
                    "user_id": users["tech"].id if sequence % 3 else users["supervisor"].id,
                    "maintenance_team_id": team.id,
                    "maintenance_type": "preventive" if preventive else "corrective",
                    "priority": "3" if asset.criticality in ("critical", "high") and not preventive else "2",
                    "description": (
                        "Enterprise demonstration work order with diagnosis, controlled checklist, "
                        "cost capture, SLA measurement and mobile completion evidence."
                    ),
                    "job_plan_id": job_plans[(asset_index - 1) % len(job_plans)].id,
                    "request_date": today - timedelta(days=sequence % 75),
                    "schedule_date": now + timedelta(days=(sequence % 19) - 7),
                    "labor_hours": 2.0 + (sequence % 7) * 0.75,
                    "labor_rate": 42.0 + (sequence % 4) * 8,
                    "parts_cost": 80.0 + (sequence % 9) * 65,
                    "contractor_cost": 650.0 if sequence % 11 == 0 else 0.0,
                    "failure_problem_id": failures["problem"][sequence % 4].id,
                    "failure_cause_id": failures["cause"][sequence % 4].id,
                    "failure_remedy_id": failures["remedy"][sequence % 4].id,
                    "downtime_hours": 0.0 if preventive else 0.5 + sequence % 6,
                    "stage_id": (done_stage if is_done else open_stage).id,
                }
                request = request_model.sudo().create(_valid(request_model, vals))
                if is_done and request.sla_policy_id:
                    start = now - timedelta(hours=10 + sequence % 30)
                    request.sudo().write({
                        "sla_start": start,
                        "sla_responded_on": start + timedelta(minutes=35),
                        "sla_resolved_on": start + timedelta(hours=3),
                    })
                elif request.sla_policy_id and sequence % 9 == 0:
                    request.sudo().write({
                        "sla_start": now - timedelta(days=2),
                        "sla_response_deadline": now - timedelta(days=1, hours=8),
                        "sla_resolution_deadline": now - timedelta(hours=3),
                    })
            count += 1
    return count


def _floorplans(env, locations, assets):
    with file_open("facility_floorplan/demo/level3.pdf", "rb") as source:
        pdf_data = base64.b64encode(source.read())
    plan_count = 0
    pin_count = 0
    for building_index, bundle in enumerate(locations, start=1):
        floor = bundle["floors"][1]
        plan_name = f"{bundle['building'].code} - Level 01 Operations Plan"
        plan = env["facility.floorplan"].sudo().search([
            ("name", "=", plan_name), ("location_id", "=", floor.id)
        ], limit=1)
        if not plan:
            plan = env["facility.floorplan"].sudo().create({
                "name": plan_name,
                "location_id": floor.id,
                "note": "Live operations plan linking maintainable assets and active work orders.",
            })
            plan.sudo().upload_sheet(f"{bundle['building'].code}-L01.pdf", pdf_data)
        plan_count += 1
        building_assets = [entry["asset"] for entry in assets if entry["bundle"]["building"] == bundle["building"]]
        for pin_index, asset in enumerate(building_assets[:6], start=1):
            if not env["facility.pin"].sudo().search([
                ("floorplan_id", "=", plan.id), ("equipment_id", "=", asset.id)
            ], limit=1):
                env["facility.pin"].sudo().create({
                    "floorplan_id": plan.id,
                    "name": asset.name,
                    "pos_x": 0.12 + (pin_index % 3) * 0.25,
                    "pos_y": 0.18 + (pin_index // 3) * 0.28,
                    "pin_type": "asset",
                    "equipment_id": asset.id,
                })
            pin_count += 1
    return plan_count, pin_count


def _spares(env, locations, assets):
    products = []
    for index, name in enumerate((
        "MERV 13 filter set", "Mechanical seal kit", "Contactor 125A",
        "Smoke detector head", "Drive belt set", "BMS I/O module",
    ), start=1):
        product = _one(
            env["product.product"],
            [("default_code", "=", f"MJL-FM-SP-{index:03d}")],
            {
                "name": name,
                "default_code": f"MJL-FM-SP-{index:03d}",
                "is_storable": True,
                "standard_price": 85.0 + index * 115,
                "list_price": 120.0 + index * 160,
            },
        )
        products.append(product)
    # Each building has a real stock-backed parts store.  Quantities are
    # deliberately mixed so the inventory views show healthy, low and reorder
    # conditions rather than a uniformly artificial register.
    quant_model = env["stock.quant"].sudo().with_context(inventory_mode=True)
    store_count = 0
    for building_index, bundle in enumerate(locations, start=1):
        store = bundle["building"].sudo().ensure_store()
        store_count += 1
        for product_index, product in enumerate(products, start=1):
            quantity = (building_index * 3 + product_index * 5) % 17
            quant = quant_model.search([
                ("product_id", "=", product.id),
                ("location_id", "=", store.id),
            ], limit=1)
            if quant:
                quant.inventory_quantity = quantity
                quant._apply_inventory()
            else:
                quant_model.create({
                    "product_id": product.id,
                    "location_id": store.id,
                    "inventory_quantity": quantity,
                })._apply_inventory()

    count = 0
    for asset_index, entry in enumerate(assets, start=1):
        if entry["asset"].criticality not in ("high", "critical"):
            continue
        for product in (products[asset_index % len(products)], products[(asset_index + 2) % len(products)]):
            if not env["facility.spare.line"].sudo().search([
                ("equipment_id", "=", entry["asset"].id), ("product_id", "=", product.id)
            ], limit=1):
                env["facility.spare.line"].sudo().create({
                    "equipment_id": entry["asset"].id,
                    "product_id": product.id,
                    "min_qty": 2 + asset_index % 4,
                    "note": "Critical spare held against the asset strategy.",
                })
            count += 1
    # Plan real parts against a representative sample of open work orders.
    part_line_count = 0
    work_orders = env["maintenance.request"].sudo().search([
        ("name", "like", "MJL-FM-WO-%"),
        ("company_id", "=", assets[0]["asset"].company_id.id),
    ], order="id")
    for request_index, request in enumerate(work_orders):
        if request_index % 7:
            continue
        for offset in (0, 2):
            product = products[(request_index + offset) % len(products)]
            if not env["facility.request.part"].sudo().search([
                ("request_id", "=", request.id), ("product_id", "=", product.id)
            ], limit=1):
                env["facility.request.part"].sudo().create({
                    "request_id": request.id,
                    "product_id": product.id,
                    "quantity": 1 + request_index % 3,
                    "unit_cost": product.standard_price,
                })
            part_line_count += 1
    return count, store_count, part_line_count


def seed_enterprise_facilities_demo(env):
    company = env["res.company"].sudo().search([
        ("name", "=", "Majal Demo Facilities LLC")
    ], limit=1)
    if not company:
        raise RuntimeError("Install majal_demo before the enterprise facilities dataset.")
    users = _users(env)
    if not all(users.values()):
        raise RuntimeError("The Majal facilities demo personas are missing.")

    locations = _locations(env, company, users)
    categories, team = _categories_and_team(env, company)
    assets = _assets(env, company, locations, categories, team, users)
    readings, scans = _meters_and_scans(env, assets, users)
    job_plans, failures = _job_plans_and_failures(env)
    policies = _sla_policies(env, company)
    contracts = _contracts(env, company, locations, assets, policies)
    pm_plans = _preventive_plans(env, assets, team, job_plans)
    work_orders = _work_orders(
        env, company, assets, team, users, job_plans, failures
    )
    floorplans, pins = _floorplans(env, locations, assets)
    spares, stores, work_order_parts = _spares(env, locations, assets)

    env["ir.config_parameter"].sudo().set_param(
        "majal.enterprise_facilities_demo.version", VERSION
    )
    return {
        "version": VERSION,
        "sites": len(SITE_SPECS),
        "buildings": len(locations),
        "assets": len(assets),
        "meter_readings": readings,
        "asset_scans": scans,
        "job_plans": len(job_plans),
        "sla_policies": len(policies),
        "maintenance_contracts": len(contracts),
        "pm_plans": pm_plans,
        "work_orders": work_orders,
        "floorplans": floorplans,
        "floorplan_pins": pins,
        "spare_links": spares,
        "parts_stores": stores,
        "work_order_part_lines": work_order_parts,
    }
