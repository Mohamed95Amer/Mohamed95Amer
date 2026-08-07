{
    "name": "Construction Progress Billing",
    "summary": "Interim Payment Certificates (IPC): certify BOQ work done, "
               "withhold retention, raise customer invoices",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_boq", "account"],
    "data": [
        "security/ir.model.access.csv",
        "views/progress_claim_views.xml",
        "views/advance_payment_views.xml",
        "views/retention_release_views.xml",
        "report/progress_claim_report.xml",
    ],
    "demo": [
        # Rules first: the claim demo is signed off through them.
        "demo/approval_rules_demo.xml",
        "demo/progress_claim_demo.xml",
    ],
    "installable": True,
}
