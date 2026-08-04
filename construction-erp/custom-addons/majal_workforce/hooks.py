"""Turn the teams that already exist into allocations.

Membership predates this module — `majal_demo` seeds it and the security rules
have been reading it since they were written. If installing turned allocations
into the source of truth without first learning what the current truth is, the
first cron sweep would empty every project team and lock a live deployment out
of its own records.

So: one open-ended allocation per existing member, marked as a backfill so it
is obvious later where it came from. Idempotent, because upgrades get re-run.
"""

from odoo import fields


def _employee_for(env, user):
    """Every allocation needs an employee; not every user has one."""
    employee = env["hr.employee"].sudo().with_context(
        active_test=False).search([("user_id", "=", user.id)], limit=1)
    if employee:
        return employee
    return env["hr.employee"].sudo().create({
        "name": user.name,
        "user_id": user.id,
        "company_id": user.company_id.id,
    })


def _backfill(env, records, target_field, member_field, start_field=None):
    Allocation = env["majal.allocation"].sudo()
    role = env.ref("majal_workforce.role_team_member")
    for record in records:
        members = record[member_field]
        if not members:
            continue
        # A start date of "today" would make every historical report claim the
        # team arrived on upgrade day. The record's own dates are the least
        # dishonest answer available.
        start = (
            (start_field and record[start_field])
            or (record.create_date and record.create_date.date())
            or fields.Date.context_today(record)
        )
        for user in members:
            employee = _employee_for(env, user)
            if Allocation.search_count([
                ("employee_id", "=", employee.id),
                (target_field, "=", record.id),
            ]):
                continue
            Allocation.create({
                "employee_id": employee.id,
                target_field: record.id,
                "role_id": role.id,
                "date_start": start,
                "origin": "backfill",
                # The member was on the exact location, not by inheritance;
                # preserve that rather than silently widening their access.
                "cascade_children": target_field == "location_id",
            })


def post_init_hook(env):
    projects = env["project.project"].sudo().search(
        [("majal_member_ids", "!=", False)])
    _backfill(env, projects, "project_id", "majal_member_ids")

    locations = env["facility.location"].sudo().search(
        [("member_user_ids", "!=", False)])
    _backfill(env, locations, "location_id", "member_user_ids")

    # Prove the projection agrees with what was already there. If it does not,
    # the assertion in the tests will say so rather than a user discovering it.
    env["majal.allocation"].sudo()._cron_sync_membership()
