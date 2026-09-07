{
    "name": "Construction RFIs",
    "summary": "Requests for Information with ball-in-court tracking, "
               "response workflow and overdue alerts",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "construction_drawing"],
    "data": [
        "security/ir.model.access.csv",
        "data/ir_cron_data.xml",
        "views/rfi_views.xml",
        "views/drawing_views.xml",
    ],
    "demo": [
        "demo/rfi_demo.xml",
    ],
    "installable": True,
}
