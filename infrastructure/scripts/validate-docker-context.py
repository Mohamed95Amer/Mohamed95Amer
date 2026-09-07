#!/usr/bin/env python3
"""Check every Dockerfile COPY source survives the .dockerignore.

This exists because of a real failure. The migration contract was added with
a COPY in Dockerfile.platform, but the dockerignore is an allow-list -- it
starts with `**` and re-includes named paths -- so the file was never in the
build context. Everything else passed: shellcheck, YAML, XML, compileall, the
whole Odoo suite. Nothing caught it, because no push-triggered job builds the
image; only the release workflow does, and that is workflow_dispatch. The
first thing to discover the bug was a deploy.

A full image build in CI would catch it too and costs minutes per push. This
costs milliseconds and catches the specific class: a COPY whose source cannot
reach the builder.

Exit 0 if every COPY source resolves to at least one file, 1 otherwise.
"""
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PAIRS = [("infrastructure/docker/Dockerfile.platform",
          "infrastructure/docker/Dockerfile.platform.dockerignore")]


def to_regex(pattern):
    """Translate a dockerignore pattern to a regex.

    Docker matches with Go's filepath.Match plus `**`. The order that matters
    here: `**` must be consumed before a bare `*`, or the double star degrades
    into "one path segment" and an allow-list stops excluding subdirectories.
    """
    i, out = 0, ["^"]
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(c))
            i += 1
    out.append("$")
    return re.compile("".join(out))


def load_ignore(path):
    rules = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            negate = line.startswith("!")
            if negate:
                line = line[1:]
            line = line.rstrip("/")
            rules.append((negate, to_regex(line), line))
    return rules


def is_included(rel, rules):
    """Last matching rule wins -- the same precedence Docker applies."""
    included = True
    for negate, rx, raw in rules:
        if rx.match(rel) or rel.startswith(raw + "/"):
            included = negate
    return included


def copy_sources(dockerfile):
    srcs = []
    with open(dockerfile, encoding="utf-8") as fh:
        text = fh.read()
    text = re.sub(r"\\\s*\n", " ", text)          # join continuations
    for line in text.splitlines():
        line = line.strip()
        if not re.match(r"^(COPY|ADD)\s", line, re.I):
            continue
        if re.search(r"--from=", line, re.I):      # from another stage, not context
            continue
        parts = [p for p in line.split()[1:] if not p.startswith("--")]
        if len(parts) < 2:
            continue
        srcs.extend(parts[:-1])                    # last token is the destination
    return srcs


def main():
    failures = []
    for df, di in PAIRS:
        dfp, dip = os.path.join(REPO, df), os.path.join(REPO, di)
        if not os.path.exists(dfp):
            print(f"FAIL: {df} not found", file=sys.stderr)
            return 1
        rules = load_ignore(dip) if os.path.exists(dip) else []
        for src in copy_sources(dfp):
            pattern = src.rstrip("/")
            matched = 0
            base = os.path.join(REPO, pattern)
            candidates = []
            if os.path.isfile(base):
                candidates = [pattern]
            elif os.path.isdir(base):
                for root, _, files in os.walk(base):
                    for f in files:
                        candidates.append(os.path.relpath(
                            os.path.join(root, f), REPO))
                        if len(candidates) > 400:
                            break
                    if len(candidates) > 400:
                        break
            else:
                failures.append(f"{df}: COPY source does not exist: {src}")
                continue
            for rel in candidates:
                if is_included(rel.replace(os.sep, "/"), rules):
                    matched += 1
                    break
            if not matched:
                failures.append(
                    f"{df}: COPY {src} -- every file under it is excluded by "
                    f"{os.path.basename(di)}, so it will not be in the build "
                    f"context and the build will fail with 'not found'. Add an "
                    f"!{pattern} line.")
    if failures:
        print("FAIL: Docker build context", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("Docker build context OK: every COPY source reaches the builder")
    return 0


if __name__ == "__main__":
    sys.exit(main())
