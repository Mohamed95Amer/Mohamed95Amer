{
    "name": "Construction Meetings & Minutes",
    "summary": "Site and progress meetings with attendance, and action items "
               "that carry forward until they are closed",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base"],
    "data": [
        "security/ir.model.access.csv",
        "views/meeting_views.xml",
        "views/meeting_menus.xml",
        "report/minutes_report.xml",
    ],
    "demo": ["demo/meeting_demo.xml"],
    "installable": True,
}
