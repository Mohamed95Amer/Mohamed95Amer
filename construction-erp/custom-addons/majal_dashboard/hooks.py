"""Make the shipped MIS instance global on databases that already have it.

data/mis_instance_data.xml now states company_id explicitly, but that file is
noupdate="1": a database created before the fix keeps the value it was given
at install, which is whichever company happened to be active then. mis_builder's
multi-company rule then hides the instance from every other company, and the
Financial board refuses everyone outside the install company -- the Platform
Owner included, which is how it survived every check made as a superuser.

So the data change alone reaches new installs only. This carries it to the
rest, and only for the one record the product ships: a customer's own
instances are left exactly as they are.
"""

import logging

_logger = logging.getLogger(__name__)


def make_shipped_mis_instance_global(env):
    instance = env.ref("majal_dashboard.mis_instance_trading",
                       raise_if_not_found=False)
    if not instance or not instance.company_id:
        return
    _logger.info(
        "Majal: releasing the shipped MIS instance from company %s so every "
        "company can open the Financial board", instance.company_id.display_name)
    instance.sudo().company_id = False
