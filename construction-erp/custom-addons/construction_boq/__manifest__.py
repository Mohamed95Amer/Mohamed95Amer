{
    "name": "Construction BOQ",
    "summary": "Bill of Quantities: hierarchical sections, priced lines with "
               "budget cost breakdown, versioning and approval lock",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "product", "analytic"],
    "data": [
        "security/ir.model.access.csv",
        "wizard/boq_import_views.xml",
        "views/boq_views.xml",
        "report/boq_report.xml",
    ],
    "demo": [
        "demo/boq_demo.xml",
        "demo/approval_rules_demo.xml",
    ],
    "installable": True,
}
