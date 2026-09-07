{
    "name": "Facility Work Orders & PM",
    "summary": "Job plans, preventive-maintenance plans (calendar & meter "
               "based) that auto-generate work orders, and maintenance costing",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["facility_asset"],
    "data": [
        "security/ir.model.access.csv",
        "data/ir_cron_data.xml",
        "views/job_plan_views.xml",
        "views/pm_plan_views.xml",
        "views/maintenance_request_views.xml",
        "views/maintenance_equipment_views.xml",
        "views/facility_menus.xml",
    ],
    "demo": [
        "demo/pm_demo.xml",
    ],
    "installable": True,
}
