{
    "name": "Majal Property Operations",
    "summary": "Leasing and tenancy for handed-over stock: leases, rent "
               "schedules, renewals and tenant maintenance requests",
    "description": """
What happens to a unit after it stops being something to sell.

A lease puts a tenant in a unit for a period at a rent, generates the
rent instalments that fall due over that period, and moves the unit
between leased and vacant as it starts and ends. A unit can only be
under one live lease at a time, enforced in the database rather than in
application code alone.

Tenants raise maintenance requests against the unit they occupy, which
is the property-side record of a problem -- the facilities modules own
the work that fixes it.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["majal_real_estate"],
    "data": [
        "security/majal_property_operations_security.xml",
        "security/ir.model.access.csv",
        "data/majal_lease_data.xml",
        "views/majal_lease_views.xml",
        "views/majal_maintenance_request_views.xml",
        "views/majal_lease_inspection_views.xml",
        "views/majal_unit_views.xml",
        "views/majal_property_operations_menus.xml",
    ],
    "demo": [
        "demo/majal_property_operations_demo.xml",
    ],
    "installable": True,
    "auto_install": False,
}
