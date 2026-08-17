"""Release the shipped MIS instance from the company that installed it.

data/mis_instance_data.xml now states company_id explicitly, but that file is
noupdate="1": a database created before the fix keeps the value it was given
at install, which is whichever company happened to be active then.
mis_builder's multi-company rule then hides the instance from every other
company, and the Financial board refuses everyone outside that one -- the
Platform Owner included, which is how it survived every check made as a
superuser.

This runs on upgrade, which is the only mechanism that reaches the databases
that need it. A post_init_hook was the wrong tool and was tried first: it
fires on install, never for a module already installed, so it would have run
precisely where the problem does not exist.

Only the record this module ships is touched. A customer's own instances,
which they may well have scoped to a company on purpose, are left alone.
"""

import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return

    from odoo import api, SUPERUSER_ID
    env = api.Environment(cr, SUPERUSER_ID, {})

    instance = env.ref("majal_dashboard.mis_instance_trading",
                       raise_if_not_found=False)
    if not instance or not instance.company_id:
        return

    _logger.info(
        "Majal: releasing the shipped MIS instance from %s so every company "
        "can open the Financial board", instance.company_id.display_name)
    instance.company_id = False
