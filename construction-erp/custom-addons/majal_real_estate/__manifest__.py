{
    "name": "Majal Real Estate",
    "summary": "Property inventory and developer sales: developments, buildings, "
               "floors and units, with leads, unit reservations, payment plans, "
               "broker commissions and a buyer portal",
    "version": "18.0.3.0.0",
    "assets": {
        "web.assets_backend": [
            "majal_real_estate/static/src/scss/property_unit.scss",
        ],
    },
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["base", "mail", "portal"],
    "data": [
        "security/majal_real_estate_security.xml",
        "security/ir.model.access.csv",
        "data/majal_reservation_data.xml",
        "data/majal_lead_data.xml",
        "views/majal_development_views.xml",
        "views/majal_community_views.xml",
        "views/majal_building_views.xml",
        "views/majal_floor_views.xml",
        "views/majal_unit_type_views.xml",
        "views/majal_unit_views.xml",
        "views/majal_payment_plan_views.xml",
        "views/majal_reservation_views.xml",
        "views/majal_commission_views.xml",
        "views/majal_lead_views.xml",
        "views/majal_handover_views.xml",
        "views/majal_cheque_views.xml",
        "views/majal_property_document_views.xml",
        "views/portal_templates.xml",
        "wizards/majal_unit_generate_wizard_views.xml",
        "views/majal_real_estate_menus.xml",
    ],
    "demo": [
        "demo/majal_real_estate_demo.xml",
    ],
    "application": True,
    "installable": True,
}
