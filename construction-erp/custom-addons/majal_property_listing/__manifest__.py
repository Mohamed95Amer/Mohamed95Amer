{
    "name": "Majal Property Listings",
    "summary": "Controlled property listings and publication workflow",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "depends": ["majal_real_estate"],
    "data": [
        "security/majal_property_listing_security.xml",
        "security/ir.model.access.csv",
        "views/listing_views.xml",
        "views/menus.xml",
    ],
    "demo": ["demo/listing_demo.xml"],
    "application": False,
    "installable": True,
    "auto_install": False,
}
