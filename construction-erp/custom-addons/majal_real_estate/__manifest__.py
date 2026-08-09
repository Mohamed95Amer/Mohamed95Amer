{
    "name": "Majal Real Estate",
    "summary": "Development hierarchy and unit inventory: developments, "
               "communities, buildings, floors and units, with a "
               "template-driven unit generator",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["base", "mail"],
    "data": [
        "security/majal_real_estate_security.xml",
        "security/ir.model.access.csv",
        "views/majal_development_views.xml",
        "views/majal_community_views.xml",
        "views/majal_building_views.xml",
        "views/majal_floor_views.xml",
        "views/majal_unit_type_views.xml",
        "views/majal_unit_views.xml",
        "wizards/majal_unit_generate_wizard_views.xml",
        "views/majal_real_estate_menus.xml",
    ],
    "demo": [
        "demo/majal_real_estate_demo.xml",
    ],
    "application": True,
    "installable": True,
}
