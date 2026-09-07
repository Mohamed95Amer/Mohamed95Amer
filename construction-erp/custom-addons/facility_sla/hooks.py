import logging

_logger = logging.getLogger(__name__)


def post_init_assign_sla(env):
    """Bring the existing open backlog under SLA cover on install.

    Without this, switching SLAs on would only cover work raised from that
    moment: every open work order would sit with no policy, no deadline and no
    escalation, which is exactly the backlog a facilities manager buys SLAs to
    get on top of. Closed work is left alone — back-dating a promise onto
    history would invent breaches that nobody committed to.
    """
    open_requests = env["maintenance.request"].search([
        ("stage_id.done", "=", False),
        ("sla_policy_id", "=", False),
    ])
    if not open_requests:
        return
    open_requests._assign_sla()
    covered = open_requests.filtered("sla_policy_id")
    _logger.info(
        "facility_sla: assigned an SLA to %s of %s open work orders",
        len(covered), len(open_requests),
    )
