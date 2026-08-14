from odoo import SUPERUSER_ID, api


def post_init_hook(cr, _registry):
    """Index the report actions installed with the platform.

    The catalogue deliberately discovers actions instead of copying a list of
    XML IDs.  A vertical can add a QWeb report without requiring a change to
    this platform module, while the unique constraint keeps upgrades safe.
    """
    env = api.Environment(cr, SUPERUSER_ID, {})
    env["majal.report.catalog"].seed_from_report_actions()
