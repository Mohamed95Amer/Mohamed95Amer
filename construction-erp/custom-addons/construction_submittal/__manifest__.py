{
    "name": "Construction Submittals",
    "summary": "Submittal register with revision cycles and multi-reviewer "
               "approval chains (tier validation)",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "base_tier_validation"],
    "data": [
        "security/ir.model.access.csv",
        "views/submittal_views.xml",
    ],
    "demo": [
        "demo/submittal_demo.xml",
    ],
    "installable": True,
}
