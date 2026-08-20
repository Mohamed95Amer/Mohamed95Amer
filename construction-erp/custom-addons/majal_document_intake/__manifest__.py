{
    "name": "Majal Document Intake",
    "summary": "Read a file, review the proposed mapping, then create the record",
    "version": "18.0.1.1.0",
    "category": "Majal/Documents",
    "license": "LGPL-3",
    "author": "Majal",
    # Targets are majal.document and majal.sheet and nothing else. Other
    # registers — the BOQ, the tender, the ledger, the maintenance backlog —
    # have their own importers and their own approvals, and reaching into them
    # from here would be an arbitrary-model write by another name.
    "depends": ["majal_documents", "construction_form", "project"],
    "data": [
        "security/majal_document_intake_security.xml",
        "security/ir.model.access.csv",
        "views/mapping_views.xml",
        "views/intake_views.xml",
        "views/form_pdf_views.xml",
        "views/document_template_views.xml",
        "views/menus.xml",
    ],
    "demo": [
        "demo/document_template_demo.xml",
    ],
    "installable": True,
}
