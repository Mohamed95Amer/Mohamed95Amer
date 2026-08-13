{
    "name": "Majal Property Experience",
    "summary": "Property workspaces, home page and My Day registers, so Real "
               "Estate reads as part of the Majal platform rather than beside it",
    "description": """
The Property app was built standalone and looks it: no workspace hub, no
landing page, nothing in My Day. This module supplies the same chrome the
Construction and Facilities suites already have.

It owns presentation only — no models of its own, no new data. It does
re-point menus belonging to majal_real_estate and majal_property_operations,
which means uninstalling it leaves those menus where it put them: Odoo does
not restore overridden field values on uninstall. That is the same bargain
every other UI module in this repo makes.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": [
        "construction_ui",
        "majal_real_estate",
        "majal_property_operations",
    ],
    "data": [
        "views/workspace_hub_views.xml",
        "views/property_home_views.xml",
        "views/majal_property_menus.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_property_ui/static/src/home/property_home.js",
            "majal_property_ui/static/src/home/property_home.xml",
            "majal_property_ui/static/src/workspace_hub/property_workspaces.js",
            "majal_property_ui/static/src/scss/property.scss",
        ],
    },
    "application": False,
    # Enabled in the isolated Property demo so the browser boot path can be
    # exercised alongside the standard application views.
    "installable": True,
    "auto_install": False,
}
