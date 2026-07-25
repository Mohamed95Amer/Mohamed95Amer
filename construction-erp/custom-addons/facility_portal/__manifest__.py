{
    "name": "Facilities Portal",
    "summary": "Occupants raise and track service requests; contractors see "
               "the work orders assigned to them",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["facility_asset", "facility_sla", "portal"],
    "data": [
        "security/ir.model.access.csv",
        "security/portal_security.xml",
        "views/portal_templates.xml",
    ],
    "demo": ["demo/portal_demo.xml"],
    "installable": True,
}
