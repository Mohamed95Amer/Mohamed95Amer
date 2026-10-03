{
    "name": "Construction Executive Dashboard",
    "summary": "Portfolio and project comparison: commercial, programme, "
               "quality, safety and materials on one screen",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "construction_report",
        "construction_material",
        "construction_hse",
        "construction_planning",
        "construction_defect",
        "construction_rfi",
    ],
    "data": [
        "views/dashboard_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "construction_dashboard/static/src/dashboard/dashboard.js",
            "construction_dashboard/static/src/dashboard/dashboard.xml",
            "construction_dashboard/static/src/dashboard/dashboard.scss",
        ],
    },
    "installable": True,
}
