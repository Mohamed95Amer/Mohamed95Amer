def migrate(cr, version):
    """Name the access level that role-less users were being granted anyway.

    The tenant rules used to read `not user.majal_role_id or rank >= 40`, so
    an internal user with no access level assigned saw the whole company
    register -- exactly what the Operations Manager level grants. The rules
    now fail closed, which is the direction a tenancy boundary has to fail,
    but that would silently take access away from anyone already relying on
    the old default.

    So write down what they already had. Every internal user without an
    access level is given Operations Manager, which is precisely the access
    the old expression handed them: nobody's visibility changes on upgrade,
    and the grant is now a row an administrator can see and revise rather
    than a default nobody wrote down.

    Portal and public accounts are left alone -- `user.share` short-circuits
    every one of these rules before the role is ever consulted, so an access
    level would mean nothing on them.
    """
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})

    operations_manager = env["majal.access.role"].search(
        [("code", "=", "operations_manager")], limit=1)
    if not operations_manager:
        # Nothing sensible to assign. Reinstalling the rules would then take
        # access away from these users with no way to hand it back, so leave
        # the database exactly as it is and say why.
        raise UserWarning(
            "majal_administration 18.0.1.3.0: the operations_manager access "
            "level is missing, so role-less users cannot be migrated before "
            "the tenant rules start failing closed. Restore the shipped "
            "access roles and upgrade again."
        )

    domain = [
        ("majal_role_id", "=", False),
        ("share", "=", False),
        # Inactive accounts count: they can be reactivated, and an archived
        # user quietly regaining the old wide access on reactivation would
        # be the same hole with a delay on it.
        ("active", "in", [True, False]),
    ]

    # Never the template. base.default_user is what Odoo copies when an
    # administrator adds a user, so stamping an access level onto it would
    # hand every future account the exact access this change exists to stop
    # granting by default -- and it would do it invisibly, which is worse
    # than the behaviour being replaced.
    template = env.ref("base.default_user", raise_if_not_found=False)
    if template:
        domain.append(("id", "!=", template.id))

    unassigned = env["res.users"].search(domain)
    if unassigned:
        unassigned.write({"majal_role_id": operations_manager.id})

    env["res.users"]._majal_install_tenant_rules()
