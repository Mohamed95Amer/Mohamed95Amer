def _workbook(title, headers, rows):
    cells = {}
    for column, header in enumerate(headers):
        cells[f"{chr(65 + column)}1"] = {"content": header}
    for row_number, row in enumerate(rows, 2):
        for column, value in enumerate(row):
            cells[f"{chr(65 + column)}{row_number}"] = {"content": str(value)}
    return {
        "version": 12.5,
        "sheets": [{
            "id": "sheet1",
            "name": title,
            "colNumber": max(12, len(headers)),
            "rowNumber": max(100, len(rows) + 10),
            "rows": {}, "cols": {}, "merges": [], "cells": cells,
            "conditionalFormats": [], "figures": [], "filterTables": [],
            "areGridLinesVisible": True, "isVisible": True,
        }],
        "revisionId": "START_REVISION",
    }


def seed_spreadsheets(env, company_users):
    specs = [
        (
            "Construction Cost Control",
            "contracting",
            ["Project", "Budget", "Committed", "Actual", "Forecast", "Variance"],
            [
                ["Harbour View", 128500000, 91600000, 74200000, 124800000, 3700000],
                ["North Utilities", 64200000, 31100000, 18400000, 62900000, 1300000],
                ["Central Hotel", 18750000, 17600000, 16350000, 18400000, 350000],
            ],
        ),
        (
            "Facilities PPM Planner",
            "facilities",
            ["Asset", "Location", "Frequency", "Last service", "Next service", "Owner"],
            [
                ["AHU-01", "Tower A Roof", "Quarterly", "2026-07-12", "2026-10-12", "HVAC Team"],
                ["Fire Pump 01", "Pump Room", "Monthly", "2026-08-01", "2026-09-01", "Fire Team"],
                ["Lift 03", "Tower B", "Monthly", "2026-08-04", "2026-09-04", "Vertical Transport"],
            ],
        ),
        (
            "Property Collections Tracker",
            "property",
            ["Development", "Unit", "Buyer", "Due", "Collected", "Outstanding"],
            [
                ["Azure Waterfront", "A-0801", "Sara Ahmed", 1820000, 364000, 1456000],
                ["Central Park", "B-0902", "Omar Youssef", 1460000, 730000, 730000],
                ["Azure Waterfront", "A-1002", "Hala Mansour", 2350000, 1880000, 470000],
            ],
        ),
    ]
    for name, key, headers, rows in specs:
        company, users = company_users[key]
        spreadsheet = env["spreadsheet.spreadsheet"].sudo().search(
            [("name", "=", name), ("company_id", "=", company.id)], limit=1
        )
        values = {
            "name": name,
            "company_id": company.id,
            "owner_id": users[0].id,
            "contributor_ids": [(6, 0, users.ids)],
            "spreadsheet_raw": _workbook(name, headers, rows),
        }
        if spreadsheet:
            spreadsheet.write(values)
        else:
            env["spreadsheet.spreadsheet"].sudo().create(values)
