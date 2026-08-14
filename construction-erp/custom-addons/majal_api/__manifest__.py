{
    "name": "Majal API Access",
    "summary": "Scoped integration clients for the Majal API",
    "version": "18.0.1.0.0",
    "category": "Majal/Integrations",
    "license": "LGPL-3",
    "depends": ["majal_administration", "project"],
    "data": [
        "security/majal_api_security.xml",
        "security/ir.model.access.csv",
        "views/api_client_views.xml",
        "views/menus.xml",
    ],
    "application": True,
    "installable": True,
}
