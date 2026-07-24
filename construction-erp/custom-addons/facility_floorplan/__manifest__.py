{
    "name": "Facility Floor Plans",
    "summary": "Pin assets, maintenance requests and notes on 2D floor plans — "
               "the CAFM counterpart of construction drawing pins",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["facility_asset", "construction_pin"],
    "data": [
        "security/ir.model.access.csv",
        "views/facility_floorplan_views.xml",
        "views/facility_location_views.xml",
        "views/facility_menus.xml",
    ],
    "demo": [
        "demo/floorplan_demo.xml",
    ],
    "application": False,
    "installable": True,
}
