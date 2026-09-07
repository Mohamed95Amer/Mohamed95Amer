import json
import logging
import time
from collections import defaultdict
from threading import Lock

from odoo import http
from odoo.http import request


_logger = logging.getLogger(__name__)

# The shallow probe answers this and nothing else. Not a version, not the
# database name, not a module list, not a traceback. An unauthenticated
# endpoint is read by everyone who finds it, and the difference between a
# health check and a reconnaissance tool is exactly this dictionary.
SHALLOW_BODY = {"status": "ok"}

# Enough for a proxy checking every few seconds, a monitoring agent, and a
# person with curl, and not enough to be worth pointing at anything.
RATE_LIMIT = 30
RATE_WINDOW = 60

_hits = defaultdict(list)
_hits_lock = Lock()


def _rate_limited(key):
    """A fixed window per caller.

    Deliberately in-process: this is a guard against a stray loop and a
    trivially cheap flood, not a defence against a distributed one, and it
    counts per worker rather than per server. Anything stronger belongs at
    the proxy, which is where the infrastructure side already terminates TLS
    and can see every worker's traffic at once.
    """
    now = time.monotonic()
    with _hits_lock:
        recent = [seen for seen in _hits[key] if now - seen < RATE_WINDOW]
        # Bound the dictionary: a caller who stops calling stops costing us
        # memory, and an attacker rotating source addresses cannot grow it
        # without also being dropped a window later.
        if not recent and key in _hits:
            del _hits[key]
        if len(recent) >= RATE_LIMIT:
            _hits[key] = recent
            return True
        recent.append(now)
        _hits[key] = recent
        return False


def _json(payload, status=200):
    return request.make_response(
        json.dumps(payload),
        headers=[
            ("Content-Type", "application/json"),
            # A cached health check is a health check that lies.
            ("Cache-Control", "no-store"),
        ],
        status=status,
    )


def _gather_checks(env):
    """The three questions the deep probe answers.

    A module-level function rather than inline in the route, because the
    router binds a route's function object once at registration: anything
    that wants to stand in for this logic — a test driving the degraded
    path, a future subclass — has to be reachable by name at call time.
    """
    checks = {}
    healthy = True

    try:
        pending = env["ir.module.module"].sudo().search_count(
            [("state", "in", ("to install", "to upgrade", "to remove"))])
        checks["modules"] = "settled" if not pending else "pending"
        healthy = healthy and not pending
    except Exception:
        _logger.exception("Deep health check could not read module states")
        checks["modules"] = "unknown"
        healthy = False

    try:
        # A cron that has stopped is how a system dies quietly: nothing
        # errors, the backups and the SLA escalations simply stop.
        stalled = env["ir.cron"].sudo().search_count([
            ("active", "=", True),
            ("nextcall", "<", env.cr.now()),
        ])
        checks["scheduler"] = "current" if not stalled else "behind"
        healthy = healthy and not stalled
    except Exception:
        _logger.exception("Deep health check could not read cron state")
        checks["scheduler"] = "unknown"
        healthy = False

    try:
        snapshots = env["majal.backup.snapshot"].sudo()
        failed = snapshots.search_count([("state", "=", "error")])
        verified = snapshots.search_count([("state", "=", "verified")])
        checks["recovery_points"] = (
            "failing" if failed else "verified" if verified else "none")
        healthy = healthy and not failed
    except Exception:
        _logger.exception("Deep health check could not read recovery points")
        checks["recovery_points"] = "unknown"
        healthy = False

    return healthy, checks


class MajalHealth(http.Controller):
    """Two probes, deliberately different in what they cost and what they say.

    Caddy currently proves the platform is up by fetching /web/login, which
    demonstrates TLS, routing and that a process is answering — but a login
    page renders perfectly well while the Majal modules behind it are mid
    upgrade. These endpoints separate "is anything answering" from "is this
    system fit to take work", and only the first is public.
    """

    @http.route(
        "/majal/health",
        type="http",
        auth="none",
        methods=["GET"],
        csrf=False,
        save_session=False,
    )
    def shallow(self, **_kwargs):
        """Is a worker answering, and can it reach the database.

        auth="none" rather than "public": a public probe would load the
        public user and a session on every hit, which is work a liveness
        check should not do. One SELECT is the cheapest question that still
        distinguishes a live worker from one holding a dead connection —
        answering "ok" without touching the database would keep saying "ok"
        while every request behind it failed.
        """
        caller = request.httprequest.remote_addr or "unknown"
        if _rate_limited(caller):
            return _json({"status": "slow down"}, status=429)
        try:
            request.env.cr.execute("SELECT 1")
            request.env.cr.fetchone()
        except Exception:
            # Logged in full here, returned as one word. The caller learns
            # that it is unhealthy, and nothing about why.
            _logger.exception("Shallow health check could not reach the database")
            return _json({"status": "unavailable"}, status=503)
        return _json(SHALLOW_BODY)

    @http.route(
        "/majal/health/deep",
        type="http",
        auth="user",
        methods=["GET"],
        csrf=False,
    )
    def deep(self, **_kwargs):
        """Is this system fit to take work.

        auth="user" only gets you as far as being somebody. Being an ordinary
        internal user is not a reason to learn that the scheduler is behind or
        that recovery points are failing — that is a map of where the platform
        is weak, and the people who need it are a monitoring agent and whoever
        runs the platform, not everyone with a login.

        The group is Platform Monitor, which grants nothing else, so an
        unattended monitoring account can be issued exactly this and no more.
        Recovery Point Operator and Platform Owner reach it by implication.

        The answer still names no version, database, container, path,
        traceback or provider configuration: a monitoring agent's credentials
        live in a configuration file and are one leak away from being
        somebody else's.
        """
        if not request.env.user.has_group(
            "majal_administration.group_platform_monitor"
        ):
            # Refused in the same shape as everything else here, and with no
            # hint about which group would have worked. A caller learns that
            # they may not ask, not what to acquire in order to.
            return _json({"status": "forbidden"}, status=403)

        healthy, checks = _gather_checks(request.env)

        payload = {"status": "ok" if healthy else "degraded", "checks": checks}
        return _json(payload, status=200 if healthy else 503)
