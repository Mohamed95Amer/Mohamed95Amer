{
    "name": "Construction HSE",
    "summary": "Permits to work, incidents and near-misses, toolbox talks and "
               "LTIFR safety statistics",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_daily_log"],
    "data": [
        "security/hse_security.xml",
        "security/ir.model.access.csv",
        "data/hse_cron.xml",
        "views/permit_views.xml",
        "views/incident_views.xml",
        "views/toolbox_talk_views.xml",
        "views/project_safety_views.xml",
        "views/hse_menus.xml",
        "report/hse_reports.xml",
    ],
    "demo": [
        "demo/hse_demo.xml",
        "demo/approval_rules_demo.xml",
    ],
    "installable": True,
}
