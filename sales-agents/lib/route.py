"""Which model does which work, and why the cheap one does most of it.

The whole cost argument of this system lives in this file.

Claude and ChatGPT are paid for already, but they are paid for as
*subscriptions*, which means the budget is measured in attention rather than
tokens: burn it on two thousand rows of data cleaning and there is none left
for the work that actually needs judgement. Ollama running locally is free and
unmetered but is not the model you want composing the first sentence a
contractor reads.

So the rule, and it is the only rule worth remembering here:

    The brain writes the rubric and the template.
    The muscle applies them to every row.

One Claude call authors the Arabic opening. Ollama then renders two thousand
personalised variants of it for nothing. Scoring, classifying, extracting,
cleaning, summarising a fetched page, drafting a caption from an existing
article — all muscle, all free, all N times. Designing the scoring rubric,
answering a real human's reply, deciding what next week should look like —
brain, once per batch.

Nothing here needs pip. urllib and subprocess are enough, and a sales system
that cannot start because a dependency failed to build is not a sales system.
"""

import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request

OLLAMA_URL = os.environ.get(
    "MAJAL_OLLAMA_URL", "http://localhost:11434/v1/chat/completions")
# The same default Majal Intelligence ships with, deliberately: one model to
# pull, one to keep warm, one set of behaviour to learn.
MUSCLE_MODEL = os.environ.get("MAJAL_MUSCLE_MODEL", "qwen3:8b")

BRAIN_TIMEOUT = int(os.environ.get("MAJAL_BRAIN_TIMEOUT", "300"))
MUSCLE_TIMEOUT = int(os.environ.get("MAJAL_MUSCLE_TIMEOUT", "120"))


class ModelUnavailable(RuntimeError):
    """Raised when a tier cannot run at all, as opposed to answering badly."""


# ----------------------------------------------------------------------
# Muscle — local, free, unmetered
# ----------------------------------------------------------------------
def run_muscle(prompt, system=None, model=None, temperature=0.2, json_mode=False):
    """Ask the local model. Use this for anything done more than twice.

    Low temperature by default: this tier is doing classification and
    templating, where the desirable property is giving the same answer to the
    same row twice, not creativity.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload = {
        "model": model or MUSCLE_MODEL,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=MUSCLE_TIMEOUT) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as error:
        raise ModelUnavailable(
            "Ollama is not answering on %s (%s). Start it with `ollama serve` "
            "and make sure `ollama pull %s` has run."
            % (OLLAMA_URL, error, model or MUSCLE_MODEL)
        ) from error
    return body["choices"][0]["message"]["content"].strip()


def muscle_json(prompt, system=None, retries=2):
    """Muscle output parsed as JSON, retried once with the error shown to it.

    A small local model gets JSON right most of the time and wrong often
    enough to matter across two thousand rows. Handing back the parse error is
    far cheaper than escalating to the paid tier, which is the failure mode
    this function exists to avoid.
    """
    system = (system or "") + (
        "\n\nReply with a single valid JSON object and nothing else. "
        "No prose, no code fences."
    )
    attempt, last_error = prompt, None
    for _ in range(retries + 1):
        raw = run_muscle(attempt, system=system, json_mode=True)
        cleaned = raw.strip().removeprefix("```json").removeprefix("```")
        cleaned = cleaned.removesuffix("```").strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as error:
            last_error = error
            attempt = (
                "%s\n\nYour previous reply was not valid JSON (%s). "
                "Return only the JSON object." % (prompt, error)
            )
    raise ValueError("Local model did not return JSON after retries: %s"
                     % last_error)


# ----------------------------------------------------------------------
# Brain — subscription CLIs, used sparingly
# ----------------------------------------------------------------------
def run_brain(prompt, engine="claude", cwd=None):
    """Ask a subscription CLI. Reserve this for judgement, once per batch.

    Both are driven as subprocesses rather than over an API because a Claude
    or ChatGPT *subscription* does not include API access — there is no key to
    put in an environment variable, and pretending otherwise is how this
    design would quietly stop being free.
    """
    if engine == "claude":
        binary = shutil.which("claude")
        if not binary:
            raise ModelUnavailable(
                "The `claude` CLI is not on PATH. Install Claude Code and run "
                "`claude` once to sign in.")
        command = [binary, "-p", prompt]
    elif engine == "codex":
        binary = shutil.which("codex")
        if not binary:
            raise ModelUnavailable(
                "The `codex` CLI is not on PATH. Install it and run "
                "`codex login` once to sign in with your ChatGPT plan.")
        command = [binary, "exec", prompt]
    else:
        raise ValueError("Unknown brain engine %r" % engine)

    try:
        finished = subprocess.run(
            command, capture_output=True, text=True,
            timeout=BRAIN_TIMEOUT, cwd=cwd, check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ModelUnavailable(
            "%s did not answer within %ss." % (engine, BRAIN_TIMEOUT)) from error
    if finished.returncode != 0:
        raise ModelUnavailable(
            "%s exited %s: %s"
            % (engine, finished.returncode, (finished.stderr or "").strip()[:500]))
    return finished.stdout.strip()


def run_brain_with_fallback(prompt, cwd=None):
    """Claude first, Codex if it cannot run.

    Two subscriptions are two independent capacity pools. When one is
    unavailable — signed out, rate limited, mid-update — the batch should
    continue on the other rather than stopping the morning's work.
    """
    try:
        return run_brain(prompt, engine="claude", cwd=cwd)
    except ModelUnavailable as first:
        try:
            return run_brain(prompt, engine="codex", cwd=cwd)
        except ModelUnavailable as second:
            raise ModelUnavailable(
                "Neither brain tier could run.\n  claude: %s\n  codex: %s"
                % (first, second)) from second


def available():
    """What can actually run right now — printed by every script at startup.

    Worth the three seconds: the failure this prevents is a scheduled run that
    looks like it worked and quietly did nothing because Ollama was not up.
    """
    status = {"muscle": False, "claude": False, "codex": False}
    try:
        run_muscle("Reply with the single word: ok")
        status["muscle"] = True
    except Exception:
        pass
    status["claude"] = bool(shutil.which("claude"))
    status["codex"] = bool(shutil.which("codex"))
    return status
