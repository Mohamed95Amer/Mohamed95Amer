def migrate(cr, version):
    from odoo import api, SUPERUSER_ID

    from odoo.addons.majal_demo.hooks import post_init_hook

    env = api.Environment(cr, SUPERUSER_ID, {})
    post_init_hook(env)
