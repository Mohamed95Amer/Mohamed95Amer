{
    "name": "Majal Property Ownership",
    "summary": "Service charge budgets and owner statements: what a building "
               "costs to run, who pays which share, and what is owed back to "
               "the owners",
    "description": """
The two halves of managing property for somebody else.

A service charge budget says what a development costs to run for a year;
the charges fall out of it, shared by unit area or equally, adding up to
the budget exactly. An owner statement gathers what was collected for one
owner in a period, takes out the management fee, service charges and
costs, and shows what is payable to them.

Leasing is optional: an owners' association that only raises service
charges can install this without it, and the rent lines are picked up
only where the leasing module is present.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["majal_real_estate"],
    "data": [
        "security/majal_property_ownership_security.xml",
        "security/ir.model.access.csv",
        "data/majal_ownership_data.xml",
        "views/majal_service_charge_views.xml",
        "views/majal_owner_statement_views.xml",
        "views/majal_property_ownership_menus.xml",
    ],
    "installable": True,
    "auto_install": False,
}
