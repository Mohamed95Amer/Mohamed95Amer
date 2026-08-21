#!/usr/bin/env python3
"""Is this machine actually able to run a sales batch right now?

Exists because of one specific failure: a scheduled task that runs, finds
Ollama down, quietly does nothing, exits zero, and reports success. Three weeks
later nobody has been contacted and the logs all say the job ran.

Exit code 1 if anything essential is missing.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import route  # noqa: E402

REQUIRED_ENV = ("MAJAL_ODOO_URL", "MAJAL_ODOO_DB",
                "MAJAL_ODOO_USER", "MAJAL_ODOO_KEY")


def main():
    problems = []
    lines = []

    missing = [name for name in REQUIRED_ENV if not os.environ.get(name)]
    if missing:
        problems.append("Odoo settings missing: %s" % ", ".join(missing))
    else:
        try:
            from majal_odoo import MajalOdoo
            odoo = MajalOdoo()
            lines.append("  odoo     connected as uid %s" % odoo.uid)
        except SystemExit as error:
            problems.append("Odoo: %s" % str(error).splitlines()[0])
        except Exception as error:                        # noqa: BLE001
            problems.append("Odoo unreachable: %s" % str(error)[:120])

    status = route.available()
    lines.append("  muscle   %s (%s)" % (
        "ready" if status["muscle"] else "NOT ANSWERING", route.MUSCLE_MODEL))
    lines.append("  claude   %s" % ("on PATH" if status["claude"] else "missing"))
    lines.append("  codex    %s" % ("on PATH" if status["codex"] else "missing"))

    if not status["muscle"]:
        problems.append(
            "Ollama is not answering on %s. Bulk work will not run, and it is "
            "deliberately not allowed to fall back to a paid tier. Start it "
            "with `ollama serve`." % route.OLLAMA_URL)
    if not (status["claude"] or status["codex"]):
        problems.append(
            "Neither subscription CLI is on PATH, so nothing can handle a "
            "reply today. Install Claude Code or the Codex CLI and sign in.")

    print("\n".join(lines))
    if problems:
        print("\nBLOCKED:")
        for problem in problems:
            print("  ! %s" % problem)
        return 1
    print("\nAll clear.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
