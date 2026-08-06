"""Backfill what each access level grants.

Until this version the group a level granted lived in Python dictionaries in
``res_users.py``; from here it is data on ``majal.access.role`` so a company
can edit it. The level rows themselves are ``noupdate="1"``, so an existing
database keeps its rows and would come out of the upgrade with empty group
sets — every user reduced to a bare internal user on their next access
change. This puts the old mapping onto the existing rows.

The mapping is hardcoded rather than imported: a migration describes the
world as it was at this version, and must keep working after the source it
came from has moved on.
"""

from odoo import SUPERUSER_ID, api


ROLE_GROUPS = {
    "platform_owner": ["majal_administration.group_platform_owner"],
    "company_admin": ["majal_administration.group_user_administrator"],
}

CONSTRUCTION_GROUPS = {
    "platform_owner": ["construction_base.group_construction_manager",
                       "project.group_project_manager"],
    "company_admin": ["construction_base.group_construction_manager",
                      "project.group_project_manager"],
    "operations_manager": ["construction_base.group_construction_manager",
                           "project.group_project_manager"],
    "manager": ["construction_base.group_construction_pm",
                "project.group_project_manager"],
    "supervisor": ["construction_base.group_construction_site_engineer",
                   "project.group_project_user"],
    "field_user": ["construction_base.group_construction_user",
                   "project.group_project_user"],
}

FACILITIES_GROUPS = {
    "platform_owner": ["majal_administration.group_facilities_manager"],
    "company_admin": ["majal_administration.group_facilities_manager"],
    "operations_manager": ["majal_administration.group_facilities_manager"],
    "manager": ["majal_administration.group_facilities_manager"],
    "supervisor": ["majal_administration.group_facilities_supervisor"],
    "field_user": ["majal_administration.group_facilities_user"],
}


def _ids(env, xmlids):
    resolved = []
    for xmlid in xmlids:
        group = env.ref(xmlid, raise_if_not_found=False)
        if group:
            resolved.append(group.id)
    return resolved


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    levels = env["majal.access.role"].with_context(active_test=False).search(
        [("company_id", "=", False)])
    for level in levels:
        # Idempotent: a level someone has already edited is left alone, so
        # re-running the upgrade cannot undo a company's configuration.
        if level.group_ids or level.construction_group_ids \
                or level.facility_group_ids:
            continue
        level.write({
            "group_ids": [
                (6, 0, _ids(env, ROLE_GROUPS.get(level.code, [])))],
            "construction_group_ids": [
                (6, 0, _ids(env, CONSTRUCTION_GROUPS.get(level.code, [])))],
            "facility_group_ids": [
                (6, 0, _ids(env, FACILITIES_GROUPS.get(level.code, [])))],
        })
