{
    "name": "Majal Property / Construction Bridge",
    "summary": "Connects developments to construction projects: taking-over "
               "dates drive handover-linked payment milestones, and punch "
               "items are raised against the unit they belong to",
    "description": """
Property and Construction are deliberately independent: neither module
depends on the other, so either can be installed on its own. This module
is where they meet.

It adds three links and nothing else:

* a development (and optionally each building) points at the construction
  project delivering it;
* the project's taking-over date drives the development's expected
  handover date, and moves the unpaid handover-linked installments of
  every buyer with it;
* a construction punch item can name the unit it was found in, so a
  handover inspection can pull the site's own snag list instead of
  retyping it.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["majal_real_estate", "construction_defect"],
    "data": [
        "views/majal_development_views.xml",
        "views/majal_building_views.xml",
        "views/majal_handover_views.xml",
        "views/construction_defect_views.xml",
        "views/project_project_views.xml",
    ],
    "installable": True,
    "auto_install": False,
}
