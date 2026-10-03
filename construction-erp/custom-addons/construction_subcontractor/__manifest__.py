{
    "name": "Construction Subcontractor Management",
    "summary": "Subcontracts on the BOQ, subcontractor payment certificates "
               "with retention and back-charges, vendor bills",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_boq", "construction_defect", "account"],
    "data": [
        "security/ir.model.access.csv",
        "views/subcontract_views.xml",
        "report/subcontract_report.xml",
    ],
    "demo": [
        "demo/subcontract_demo.xml",
    ],
    "installable": True,
}
