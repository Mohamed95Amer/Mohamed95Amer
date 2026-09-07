{
    "name": "Majal eSign",
    "summary": "Internal signing requests for controlled Majal documents",
    "version": "18.0.1.0.0",
    "category": "Majal/Documents",
    "license": "LGPL-3",
    "depends": ["majal_documents"],
    "data": [
        "security/majal_sign_security.xml",
        "security/ir.model.access.csv",
        "views/sign_request_views.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_sign/static/src/scss/sign.scss",
        ],
    },
    "application": True,
    "installable": True,
}
