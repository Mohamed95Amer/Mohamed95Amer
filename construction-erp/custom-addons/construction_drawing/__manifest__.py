{
    "name": "Construction Drawings",
    "summary": "Drawing register with revision control, supersede workflow "
               "and bulk PDF upload",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_base"],
    "external_dependencies": {"python": ["pypdf"]},
    "data": [
        "security/ir.model.access.csv",
        "views/drawing_views.xml",
        "views/transmittal_views.xml",
        "wizard/drawing_upload_views.xml",
    ],
    "demo": [
        "demo/drawing_demo.xml",
    ],
    "installable": True,
}
