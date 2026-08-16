def post_init_hook(env):
    """Index the report actions installed with the platform.

    The catalogue deliberately discovers actions instead of copying a list of
    XML IDs.  A vertical can add a QWeb report without requiring a change to
    this platform module, while the unique constraint keeps upgrades safe.

    Odoo 18 calls install hooks with an Environment. The pre-17 signature was
    (cr, registry), and keeping it here did not fail politely: the hook runs
    inside load_module_graph, so the TypeError aborted the registry load and
    took the entire install down — every module, not just this one. The other
    three hooks in this repo already take env; this one was the outlier.
    """
    env["majal.report.catalog"].sudo().seed_from_report_actions()
