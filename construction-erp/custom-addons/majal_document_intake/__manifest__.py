{
    "name": "Majal Document Intake",
    "summary": "Read a file, review the proposed mapping, then create the record",
    "version": "18.0.1.2.0",
    "category": "Majal/Documents",
    "license": "LGPL-3",
    "author": "Majal",
    # Targets are majal.document, majal.sheet and construction.form.template,
    # and nothing else. Other registers — the BOQ, the tender, the ledger, the
    # maintenance backlog — have their own importers and their own approvals,
    # and reaching into them from here would be an arbitrary-model write by
    # another name. All three go through the same _intake_writable_fields()
    # gate; for the form template it names the answer types a question may
    # take rather than field names. See README.md.
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
