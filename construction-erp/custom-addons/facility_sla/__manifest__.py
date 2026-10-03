{
    "name": "Facilities SLA",
    "summary": "Response and resolution SLAs on maintenance work orders, "
               "measured on the business calendar with escalation",
    "version": "18.0.1.0.0",
    "category": "Facilities",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["facility_asset", "facility_workorder", "resource"],
    "data": [
        "security/ir.model.access.csv",
        "data/sla_cron.xml",
        "views/sla_policy_views.xml",
        "views/maintenance_request_views.xml",
        "views/sla_menus.xml",
    ],
    "demo": ["demo/sla_demo.xml"],
    "post_init_hook": "post_init_assign_sla",
    "installable": True,
}
