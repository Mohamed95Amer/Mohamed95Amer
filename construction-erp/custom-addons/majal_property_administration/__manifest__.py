{
    "name": "Majal Property / Administration Bridge",
    "summary": "Gives the shipped access levels their Property permissions, "
               "for tenants who run Property alongside the rest of the suite",
    "description": """
majal_administration knows how to grant a suite's groups but must not
require any particular suite: a construction-only tenant should never end
up with the Property app installed because they wanted access levels.

So the levels ship with an empty property column, and this module fills
it in. Installed only where both are present.
""",
    "version": "18.0.1.0.0",
    "category": "Real Estate",
    "license": "LGPL-3",
    "author": "Mohamed Amer",
    "website": "https://github.com/Mohamed95Amer/Mohamed95Amer",
    "depends": ["majal_administration", "majal_real_estate"],
    "data": ["data/access_roles.xml"],
    "post_init_hook": "post_init_reapply_access",
    "installable": True,
    # Install this bridge explicitly after majal_administration has been
    # upgraded.  Auto-installing it while adding Real Estate to an older
    # database can load its role data before the new role relation table
    # exists.
    "auto_install": False,
}
