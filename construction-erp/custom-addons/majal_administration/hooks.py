def post_init_hook(env):
    """Map existing operational users to the nearest protected Majal role.

    Technical/template accounts and users with custom permissions remain
    untouched. New client users are always created through the role wizard.
    """
    env["majal.backup.snapshot"]._ensure_slots()
    users = env["res.users"].with_context(active_test=False).search(
        [
            ("share", "=", False),
            ("majal_role_id", "=", False),
            ("login", "not in", ["default", "__system__"]),
        ]
    )
    roles = {
        role.code: role
        for role in env["majal.access.role"].search([("active", "=", True)])
    }
    for user in users:
        construction = user.has_group("construction_base.group_construction_user")
        facilities = user.has_group(
            "majal_administration.group_facilities_user"
        ) or user.has_group("maintenance.group_equipment_manager")
        if not construction and not facilities:
            continue
        scope = (
            "both"
            if construction and facilities
            else "construction"
            if construction
            else "facilities"
        )
        if user.has_group("construction_base.group_construction_manager"):
            role = roles["operations_manager"]
        elif user.has_group("construction_base.group_construction_pm") or user.has_group(
            "maintenance.group_equipment_manager"
        ):
            role = roles["manager"]
        elif user.has_group(
            "construction_base.group_construction_site_engineer"
        ) or user.has_group("construction_base.group_construction_commercial"):
            role = roles["supervisor"]
        else:
            role = roles["field_user"]
        user._majal_apply_role(role, scope)
