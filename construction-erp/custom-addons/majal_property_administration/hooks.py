def post_init_reapply_access(env):
    """Give existing users the Property groups their level now includes.

    Access levels are applied by rewriting a user's groups wholesale, so
    until this runs, everybody on the platform is carrying the group set
    that was computed before Property existed -- which is to say, without
    it. That includes the administrator, whose own membership is rewritten
    the same way, so nobody would see the app at all.
    """
    users = env["res.users"].search([("majal_role_id", "!=", False)])
    users._majal_reapply_current_access()
