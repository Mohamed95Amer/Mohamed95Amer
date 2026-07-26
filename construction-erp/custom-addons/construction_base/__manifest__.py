{
    "name": "Construction Base",
    "summary": "Shared foundation for the construction suite: security groups, "
               "project extensions, document numbering mixin",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["project", "mail", "portal", "hr"],
    "data": [
        "security/construction_security.xml",
        "security/ir.model.access.csv",
        "data/ir_sequence_data.xml",
        "views/project_views.xml",
        "views/construction_menus.xml",
        "views/approval_views.xml",
    ],
    "demo": [
        "demo/project_demo.xml",
        "demo/approval_demo.xml",
    ],
    "application": True,
    "installable": True,
}
