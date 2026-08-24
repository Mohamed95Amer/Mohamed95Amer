{
    "name": "Majal Documents",
    "summary": "Client-branded, versioned documents and structured sheets",
    "version": "18.0.1.1.0",
    "category": "Majal/Documents",
    "license": "LGPL-3",
    "depends": [
        "dms",
        "mail",
        "project",
        "spreadsheet_oca",
        "web_editor",
        "majal_administration",
    ],
    "data": [
        "security/majal_documents_security.xml",
        "security/ir.model.access.csv",
        "data/sequences.xml",
        "views/res_company_views.xml",
        "views/document_template_views.xml",
        "views/document_views.xml",
        "views/sheet_views.xml",
        "views/menus.xml",
        "report/document_report.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_documents/static/src/scss/documents.scss",
        ],
    },
    "application": True,
    "installable": True,
}
