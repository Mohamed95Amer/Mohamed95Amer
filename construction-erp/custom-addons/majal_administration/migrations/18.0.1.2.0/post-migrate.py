def migrate(cr, version):
    """Reapply shipped role grants and tenant rules on existing databases."""
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})
    stages = env.ref("project.group_project_stages", raise_if_not_found=False)
    if stages:
        for code in ("platform_owner", "company_admin", "operations_manager", "manager"):
            roles = env["majal.access.role"].search([("code", "=", code)])
            roles.write({"construction_group_ids": [(4, stages.id)]})
    env["res.users"]._majal_install_tenant_rules()
