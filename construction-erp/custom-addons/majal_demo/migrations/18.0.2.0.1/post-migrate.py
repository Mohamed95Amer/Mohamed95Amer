def migrate(cr, version):
    """Seed the acceptance dataset when an existing demo database upgrades.

    ``post_init_hook`` only runs when the module is first installed.  Demo
    environments that already had an older ``majal_demo`` therefore received
    the new code but not the Property, office, approval, and signing records
    introduced in 18.0.2.0.0.  The seeder is deliberately idempotent, so the
    upgrade path can safely invoke the same entry point.
    """
    from odoo import api, SUPERUSER_ID

    from odoo.addons.majal_demo.hooks import post_init_hook

    env = api.Environment(cr, SUPERUSER_ID, {})
    post_init_hook(env)
