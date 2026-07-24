{
    "name": "Construction Defects (Punch Lists)",
    "summary": "Snagging / punch lists and defects-liability items, pinnable on "
               "drawings, assignable to subcontractors",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_pin"],
    "data": [
        "security/ir.model.access.csv",
        "views/defect_views.xml",
        "report/defect_report.xml",
    ],
    "demo": [
        "demo/defect_demo.xml",
    ],
    "installable": True,
}
