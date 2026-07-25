{
    "name": "Construction Change Orders",
    "summary": "Change events and variation orders that adjust the BOQ / "
               "contract value on approval",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_boq", "construction_rfi"],
    "data": [
        "security/ir.model.access.csv",
        "views/change_order_views.xml",
        "views/rfi_views.xml",
        "report/change_order_report.xml",
    ],
    "demo": [
        "demo/change_order_demo.xml",
        "demo/approval_rules_demo.xml",
    ],
    "installable": True,
}
