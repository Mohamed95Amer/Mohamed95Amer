{
    "name": "Majal Approval Studio",
    "summary": "Configure and monitor reusable Majal approval workflows",
    "version": "18.0.1.0.0",
    "category": "Majal/Platform",
    "license": "LGPL-3",
    "author": "Majal",
    "depends": ["construction_base"],
    "data": [
        "views/approval_views.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_approval_studio/static/src/scss/approval_studio.scss",
        ],
    },
    "icon": "majal_approval_studio/static/description/icon.svg",
    "application": True,
    "installable": True,
}
