{
    "name": "Construction Pins (Plan Viewer)",
    "summary": "Fieldwire/PlanRadar-style pins dropped on drawing sheets, with "
               "an interactive plan viewer",
    "version": "18.0.1.1.0",
    "category": "Construction",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["construction_drawing", "construction_rfi"],
    "data": [
        "security/ir.model.access.csv",
        "views/pin_views.xml",
        "views/drawing_views.xml",
        "views/plan_viewer_action.xml",
    ],
    "demo": [
        "demo/pin_demo.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "construction_pin/static/src/plan_viewer/*.js",
            "construction_pin/static/src/plan_viewer/*.xml",
            "construction_pin/static/src/plan_viewer/*.scss",
        ],
    },
    "installable": True,
}
