{
    "name": "Construction Portal",
    "summary": "Free portal for subcontractors, clients and consultants: "
               "self-service RFIs, defects and subcontracts",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "portal",
        "construction_rfi",
        "construction_defect",
        "construction_subcontractor",
    ],
    "data": [
        "security/ir.model.access.csv",
        "security/portal_security.xml",
        "views/portal_templates.xml",
    ],
    "demo": [
        "demo/portal_demo.xml",
    ],
    "installable": True,
}
