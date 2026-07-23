{
    "name": "Construction BOQ",
    "summary": "Bill of Quantities: hierarchical sections, priced lines with "
               "budget cost breakdown, versioning and approval lock",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base", "product", "analytic"],
    "data": [
        "security/ir.model.access.csv",
        "views/boq_views.xml",
    ],
    "demo": [
        "demo/boq_demo.xml",
    ],
    "installable": True,
}
