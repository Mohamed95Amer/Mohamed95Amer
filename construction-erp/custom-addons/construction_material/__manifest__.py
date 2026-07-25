{
    "name": "Construction Materials & Site Inventory",
    "summary": "Site stores, material issues against the works, waste/scrap "
               "with reasons, and budget-vs-consumed reconciliation per product",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_boq", "stock"],
    "data": [
        "security/ir.model.access.csv",
        "data/material_data.xml",
        "views/material_issue_views.xml",
        "views/material_summary_views.xml",
        "views/stock_scrap_views.xml",
        "views/project_material_views.xml",
        "views/material_menus.xml",
        "report/material_reports.xml",
    ],
    "demo": ["demo/material_demo.xml"],
    "installable": True,
}
