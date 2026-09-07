{
    "name": "Majal Property / Facilities Bridge",
    "summary": "Publishes handed-over property into the Facilities location "
               "tree, attributes assets to units and owners, and turns tenant "
               "reports into work orders",
    "description": """
Property and Facilities are independent apps; this is where they meet.

A unit becomes a Facilities location when somebody has to maintain it —
at handover, or when published by hand — rather than the moment it is
typed in, so a 900-unit off-plan tower does not fill the FM tree with
rooms that do not exist yet.

Once published, the unit's location carries the FM team assigned to its
development, which is what makes it visible to the technicians who work
it. A tenant's report stays a tenant's report; escalating it raises a
work order alongside, and Facilities owns closure from that point.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    # facility_contract and facility_inventory are deliberately not here: they
    # are AGPL-3 and pull in OCA contract, account and stock, none of which
    # this bridge needs.
    "depends": [
        "majal_property_operations",
        "facility_asset",
        "facility_workorder",
        "facility_sla",
    ],
    "data": [
        "views/majal_development_views.xml",
        "views/majal_unit_views.xml",
        "views/majal_maintenance_request_views.xml",
        "views/facility_location_views.xml",
        "views/maintenance_views.xml",
    ],
    "installable": True,
    "auto_install": False,
}
