{
    "name": "Majal Intelligence",
    "summary": "Secure bilingual AI copilot for construction and facilities",
    "version": "18.0.1.5.0",
    "category": "Productivity/AI",
    "license": "LGPL-3",
    "author": "Majal",
    "depends": [
        "mail",
        "project",
        "maintenance",
        "construction_base",
        "facility_asset",
        "facility_workorder",
        "majal_branding",
    ],
    "data": [
        "security/majal_ai_security.xml",
        "security/ir.model.access.csv",
        "data/provider_data.xml",
        "views/majal_ai_views.xml",
        "views/majal_ai_menus.xml",
        "data/default_landing.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_ai/static/src/workspace/workspace.js",
            "majal_ai/static/src/workspace/workspace.xml",
            "majal_ai/static/src/workspace/workspace.scss",
        ],
    },
    "application": True,
    "installable": True,
}
