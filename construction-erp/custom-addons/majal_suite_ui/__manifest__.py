{
    "name": "Majal Suite Experience",
    "summary": "The Majal shell: sidebar, app launcher, workspace hub, My Day "
               "and the brand's design tokens, with no knowledge of any "
               "particular application",
    "description": """
Majal is sold as three products -- Construction, Facilities and Property --
and a customer usually buys one. The chrome they share cannot therefore
live inside any of them.

This module holds it: the sidebar, the app launcher, the workspace hub
component, the My Day framework, and the SCSS tokens the whole suite is
drawn with. It depends on Odoo and nothing else, so any one suite can be
installed on its own and still look like Majal.

Each suite fills the empty AREAS / WORKSPACES / OPERATIONAL_METRICS
registries at import time and calls registerWorkspaces with its own keys.
""",
    "version": "18.0.1.0.0",
    "category": "Hidden/Tools",
    "license": "LGPL-3",
    "author": "Majal",
    "depends": ["web", "mail"],
    "data": [
        "views/my_day_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "majal_suite_ui/static/src/app_launcher/app_launcher.xml",
            "majal_suite_ui/static/src/app_launcher/app_launcher.scss",
            "majal_suite_ui/static/src/my_day/my_day.js",
            "majal_suite_ui/static/src/my_day/my_day.xml",
            "majal_suite_ui/static/src/my_day/my_day.scss",
            "majal_suite_ui/static/src/workspace_hub/workspace_hub.js",
            "majal_suite_ui/static/src/workspace_hub/workspace_hub.xml",
            "majal_suite_ui/static/src/workspace_hub/workspace_hub.scss",
            "majal_suite_ui/static/src/sidebar/majal_sidebar.js",
            "majal_suite_ui/static/src/sidebar/majal_sidebar.xml",
            "majal_suite_ui/static/src/sidebar/majal_sidebar.scss",
            "majal_suite_ui/static/src/scss/suite_home.scss",
            "majal_suite_ui/static/src/scss/backend.scss",
            "majal_suite_ui/static/src/scss/rtl.scss",
        ],
    },
    "application": False,
    "installable": True,
}
