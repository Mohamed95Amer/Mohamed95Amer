{
    "name": "Facility Asset Registry",
    "summary": "CAFM asset registry: location hierarchy, criticality, "
               "warranties, meters, failure codes and spare parts on top of "
               "Odoo Maintenance",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["maintenance", "product"],
    "data": [
        "security/ir.model.access.csv",
        "data/ir_cron_data.xml",
        "views/facility_location_views.xml",
        "views/facility_failure_views.xml",
        "views/maintenance_equipment_views.xml",
        "views/maintenance_request_views.xml",
        "views/facility_menus.xml",
    ],
    "demo": [
        "demo/facility_demo.xml",
    ],
    "application": True,
    "installable": True,
}
