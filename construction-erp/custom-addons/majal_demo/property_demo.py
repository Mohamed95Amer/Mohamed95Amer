import base64
from datetime import timedelta

from odoo import Command, fields
from odoo.tools import file_open


def _record(model, domain, values):
    record = model.sudo().search(domain, limit=1)
    if record:
        record.write(values)
        return record
    return model.sudo().create(values)


def seed_property_demo(env, company, users):
    """Create a sizeable, deterministic Property portfolio.

    This deliberately uses ordinary records rather than dashboard-only
    fixtures. Every KPI, chart and workflow therefore traces back to data a
    user can open, filter and change.
    """
    today = fields.Date.today()
    developer = _record(
        env["res.partner"],
        [("name", "=", "Majal Demo Properties"), ("company_id", "=", company.id)],
        {
            "name": "Majal Demo Properties",
            "company_type": "company",
            "company_id": company.id,
            "email": "property@demo.local",
        },
    )
    with file_open("majal_real_estate/static/src/img/unit-interior.png", "rb") as handle:
        interior = base64.b64encode(handle.read())

    development_specs = [
        ("Azure Waterfront Residences", "AWR", "Dubai", "active", 210000, True),
        ("Central Park Living", "CPL", "Abu Dhabi", "active", 155000, False),
        ("Creek Business Quarter", "CBQ", "Dubai", "planning", 325000, False),
    ]
    developments = []
    units = env["majal.unit"]
    statuses = [
        "available", "available", "reserved", "sold", "under_contract",
        "handover_due", "handed_over", "leased", "vacant", "under_maintenance",
    ]
    for dev_index, (name, code, city, state, area, featured) in enumerate(
        development_specs, 1
    ):
        development = _record(
            env["majal.development"],
            [("code", "=", code), ("company_id", "=", company.id)],
            {
                "name": name,
                "code": code,
                "company_id": company.id,
                "developer_id": developer.id,
                "state": state,
                "city": city,
                "land_area": area,
                "expected_handover_date": today + timedelta(days=365 + dev_index * 120),
                "dashboard_featured": featured,
                "dashboard_image": interior,
                "description": "Synthetic Majal demonstration portfolio; no client data.",
            },
        )
        developments.append(development)
        community = _record(
            env["majal.community"],
            [("name", "=", f"{name} Community"), ("development_id", "=", development.id)],
            {"name": f"{name} Community", "development_id": development.id},
        )
        unit_types = []
        for category, bedrooms, bathrooms, suite, balcony, price in [
            ("1br", 1, 2, 720, 90, 1_180_000),
            ("2br", 2, 3, 1_030, 140, 1_850_000),
            ("3br", 3, 4, 1_520, 220, 2_760_000),
        ]:
            unit_types.append(
                _record(
                    env["majal.unit.type"],
                    [("name", "=", f"{code} {category.upper()}"), ("development_id", "=", development.id)],
                    {
                        "name": f"{code} {category.upper()}",
                        "development_id": development.id,
                        "unit_category": category,
                        "bedrooms": bedrooms,
                        "bathrooms": bathrooms,
                        "suite_area": suite,
                        "balcony_area": balcony,
                        "typical_price": price,
                    },
                )
            )
        for tower_index, tower_code in enumerate(("A", "B"), 1):
            building = _record(
                env["majal.building"],
                [("code", "=", f"{code}-{tower_code}"), ("development_id", "=", development.id)],
                {
                    "name": f"Tower {tower_code}",
                    "code": f"{code}-{tower_code}",
                    "development_id": development.id,
                    "community_id": community.id,
                    "building_type": "tower",
                    "planned_floor_count": 24,
                },
            )
            for floor_number in (8, 9, 10, 11):
                floor = _record(
                    env["majal.floor"],
                    [("number", "=", floor_number), ("building_id", "=", building.id)],
                    {
                        "name": f"Floor {floor_number}",
                        "number": floor_number,
                        "building_id": building.id,
                    },
                )
                for position in (1, 2):
                    index = len(units)
                    unit_type = unit_types[(floor_number + position) % len(unit_types)]
                    unit = _record(
                        env["majal.unit"],
                        [("name", "=", f"{tower_code}-{floor_number:02d}{position:02d}"), ("building_id", "=", building.id)],
                        {
                            "name": f"{tower_code}-{floor_number:02d}{position:02d}",
                            "floor_id": floor.id,
                            "unit_type_id": unit_type.id,
                            "unit_category": unit_type.unit_category,
                            "bedrooms": unit_type.bedrooms,
                            "bathrooms": unit_type.bathrooms,
                            "suite_area": unit_type.suite_area,
                            "balcony_area": unit_type.balcony_area,
                            "view": "Waterfront" if tower_index == 1 else "City",
                            "orientation": "NW" if position == 1 else "SE",
                            "parking_ref": f"P{tower_index}-{floor_number:02d}{position:02d}",
                            "list_price": unit_type.typical_price + floor_number * 12_500,
                            "status": statuses[index % len(statuses)],
                            "listing_readiness": 72 + (index % 6) * 5,
                            "marketing_image": interior if index % 3 == 0 else False,
                        },
                    )
                    units |= unit

    stages = env["majal.lead.stage"].sudo().search([], order="sequence")
    if stages:
        for index in range(12):
            _record(
                env["majal.lead"],
                [("name", "=", f"Demo property enquiry {index + 1:02d}"), ("company_id", "=", company.id)],
                {
                    "name": f"Demo property enquiry {index + 1:02d}",
                    "contact_name": f"Prospect {index + 1:02d}",
                    "email": f"prospect{index + 1}@demo.local",
                    "phone": f"+971 50 000 {index + 1:04d}",
                    "company_id": company.id,
                    "development_id": developments[index % len(developments)].id,
                    "stage_id": stages[index % len(stages)].id,
                    "priority": str(index % 3),
                    "source": ("Website", "Broker", "Walk-in")[index % 3],
                    "budget": 1_250_000 + index * 175_000,
                    "user_id": users["sales"].id,
                    "state": "won" if index in (3, 8) else "open",
                },
            )

    buyers = []
    for index, name in enumerate(("Sara Ahmed", "Omar Youssef", "Hala Mansour"), 1):
        buyers.append(
            _record(
                env["res.partner"],
                [("name", "=", name), ("company_id", "=", company.id)],
                {"name": name, "company_id": company.id, "email": f"buyer{index}@demo.local"},
            )
        )
    candidate_units = units.filtered(lambda unit: unit.status in ("reserved", "sold"))[:3]
    for index, unit in enumerate(candidate_units):
        reservation = _record(
            env["majal.reservation"],
            [("unit_id", "=", unit.id), ("partner_id", "=", buyers[index].id)],
            {
                "unit_id": unit.id,
                "partner_id": buyers[index].id,
                "user_id": users["sales"].id,
                "reservation_date": today - timedelta(days=35 - index * 8),
                "expiry_date": today + timedelta(days=10 + index * 5),
                "sale_price": unit.list_price * 0.98,
                "reservation_fee": 50_000,
                "state": "converted" if unit.status == "sold" else "confirmed",
            },
        )
        for sequence, label, percent, due_offset, paid_ratio in [
            (10, "Booking", 20, -20, 1.0),
            (20, "Construction milestone", 50, 120, 0.25 if index == 1 else 0.0),
            (30, "Handover", 30, 420, 0.0),
        ]:
            amount = reservation.sale_price * percent / 100
            _record(
                env["majal.payment.installment"],
                [("reservation_id", "=", reservation.id), ("sequence", "=", sequence)],
                {
                    "reservation_id": reservation.id,
                    "sequence": sequence,
                    "name": label,
                    "due_date": today + timedelta(days=due_offset),
                    "percentage": percent,
                    "amount": amount,
                    "amount_paid": amount * paid_ratio,
                    "payment_date": today - timedelta(days=18) if paid_ratio else False,
                },
            )

    lease_unit = units.filtered(lambda unit: unit.status == "leased")[:1]
    if lease_unit:
        tenant = _record(
            env["res.partner"],
            [("name", "=", "Rania Haddad"), ("company_id", "=", company.id)],
            {"name": "Rania Haddad", "company_id": company.id, "email": "tenant@demo.local"},
        )
        lease = _record(
            env["majal.lease"],
            [("unit_id", "=", lease_unit.id), ("tenant_id", "=", tenant.id)],
            {
                "unit_id": lease_unit.id,
                "tenant_id": tenant.id,
                "user_id": users["ops"].id,
                "start_date": today - timedelta(days=90),
                "end_date": today + timedelta(days=275),
                "frequency": "quarterly",
                "annual_rent": 115_000,
                "deposit": 12_000,
                "state": "active",
            },
        )
        if not lease.rent_line_ids:
            lease.action_generate_rent_schedule()
        for index, (subject, category, priority, state) in enumerate([
            ("AC not cooling", "hvac", "2", "in_progress"),
            ("Access card replacement", "other", "1", "new"),
            ("Kitchen cabinet adjustment", "other", "0", "done"),
        ]):
            _record(
                env["majal.maintenance.request"],
                [("name", "=", subject), ("unit_id", "=", lease_unit.id)],
                {
                    "name": subject,
                    "unit_id": lease_unit.id,
                    "lease_id": lease.id,
                    "partner_id": tenant.id,
                    "user_id": users["ops"].id,
                    "category": category,
                    "priority": priority,
                    "state": state,
                    "reported_date": today - timedelta(days=index + 1),
                    "description": "Synthetic request for workflow and SLA testing.",
                },
            )
    return {"developments": len(developments), "units": len(units)}
