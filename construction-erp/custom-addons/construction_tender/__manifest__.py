{
    "name": "Construction Tendering",
    "summary": "Tender packages, bid invitations, line-by-line bid leveling "
               "and award straight into a subcontract",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_boq", "construction_subcontractor"],
    "data": [
        "security/ir.model.access.csv",
        "views/tender_views.xml",
        "views/bid_views.xml",
        "views/tender_menus.xml",
        "report/tender_reports.xml",
    ],
    "demo": ["demo/tender_demo.xml"],
    "installable": True,
}
