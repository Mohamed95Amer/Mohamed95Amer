{
    "name": "Construction Commercial Reporting (CVR)",
    "summary": "Cost Value Reconciliation: budget vs committed vs cost vs "
               "certified value, with earned and forecast margin per project",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "construction_boq",
        "construction_progress_billing",
        "construction_change_order",
        "construction_subcontractor",
    ],
    "data": [
        "views/project_cvr_views.xml",
        "views/exposure_views.xml",
        "views/section_cvr_views.xml",
        "report/cvr_report.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "construction_report/static/src/exposure/exposure.js",
            "construction_report/static/src/exposure/exposure.xml",
            "construction_report/static/src/exposure/exposure.scss",
        ],
    },
    "installable": True,
}
