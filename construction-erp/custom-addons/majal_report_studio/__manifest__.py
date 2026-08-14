{
    "name": "Majal Report Studio",
    "summary": "One branded catalogue for the reports already available in Majal",
    "version": "18.0.1.0.0",
    "category": "Majal/Reporting",
    "license": "LGPL-3",
    "author": "Majal",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["majal_documents", "majal_branding"],
    "data": [
        "security/majal_report_studio_security.xml",
        "security/ir.model.access.csv",
        "views/report_catalog_views.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_report_studio/static/src/scss/report_studio.scss",
        ],
    },
    "post_init_hook": "post_init_hook",
    "application": True,
    "installable": True,
}
