{
    "name": "Majal Workforce",
    "summary": "Allocate people to projects and facility locations",
    "version": "18.0.1.0.0",
    "category": "Majal/Administration",
    "license": "LGPL-3",
    "author": "Majal",
    # majal_administration already brings construction_base, facility_asset,
    # hr and project. It is also where the membership fields this module
    # projects into are defined, so depending on it is not a convenience —
    # the projection is meaningless without those fields.
    "depends": [
        "majal_administration",
    ],
    "data": [
        "security/majal_workforce_security.xml",
        "security/ir.model.access.csv",
        "data/allocation_roles.xml",
        "data/allocation_cron.xml",
        "views/allocation_views.xml",
        "views/project_views.xml",
        "views/facility_location_views.xml",
        "views/hr_employee_views.xml",
        "wizards/allocate_wizard_views.xml",
        "wizards/end_allocation_wizard_views.xml",
        "views/menus.xml",
    ],
    "demo": ["demo/allocation_demo.xml"],
    "application": False,
    "installable": True,
    "post_init_hook": "post_init_hook",
}
