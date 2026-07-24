{
    "name": "Construction Daily Log",
    "summary": "Digital site diary: weather, manpower, equipment, activities "
               "and delays with one-click PDF",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_boq"],
    "data": [
        "security/ir.model.access.csv",
        "views/daily_log_views.xml",
        "report/daily_log_report.xml",
    ],
    "demo": [
        "demo/daily_log_demo.xml",
    ],
    "installable": True,
}
