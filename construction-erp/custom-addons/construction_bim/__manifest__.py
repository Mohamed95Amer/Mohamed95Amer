{
    "name": "Construction BIM",
    "summary": "Index IFC models and link their elements to RFIs, defects, "
               "tasks and bill items, with a 3D viewer in the browser",
    "version": "18.0.1.0.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_base",
        "construction_boq",
        "construction_rfi",
        "construction_defect",
    ],
    "data": [
        "security/ir.model.access.csv",
        "views/bim_views.xml",
        "views/bim_pin_views.xml",
        "views/bim_clash_views.xml",
        "views/bim_compare_views.xml",
        "views/boq_bridge_views.xml",
        "views/bim_menus.xml",
    ],
    "demo": ["demo/bim_demo.xml"],
    "assets": {
        # Only the viewer shell is bundled. web-ifc (6 MB) and three.js are
        # fetched by scripts/fetch-bim-libs.sh and loaded on demand by the
        # component, so opening any other screen costs nothing.
        "web.assets_backend": [
            "construction_bim/static/src/viewer/bim_viewer.js",
            "construction_bim/static/src/viewer/bim_viewer.xml",
            "construction_bim/static/src/viewer/bim_viewer.scss",
        ],
    },
    "installable": True,
}
