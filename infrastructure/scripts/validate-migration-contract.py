#!/usr/bin/env python3
"""Validate the release migration contract, and check it against reality.

Infrastructure refuses unpinned releases and backs up before updating, but it
cannot infer whether an addon upgrade leaves the database readable by the
previous image. That judgement is a human's, and this file is where the human
records it.

The check that earns this script its place is the last one: it walks the
addons tree for migration directories and fails when the contract does not
account for them. A contract is only worth reading if it cannot quietly go
stale, and the failure mode it guards against -- someone adds a migration and
forgets the contract -- is the normal one.

Exit 0 valid, 1 invalid.
"""
import json
import os
import sys

FLAGS = ("none", "forward-compatible", "restore-required")
ADDON_ROOTS = ("construction-erp/custom-addons",
               "construction-erp/oca-addons",
               "construction-erp/third-party-addons")


def find_modules_with_migrations(repo):
    found = set()
    for root in ADDON_ROOTS:
        base = os.path.join(repo, root)
        if not os.path.isdir(base):
            continue
        for module in sorted(os.listdir(base)):
            mig = os.path.join(base, module, "migrations")
            if not os.path.isdir(mig):
                continue
            # A migrations/ directory with no version dir holding a script is
            # an empty shell and migrates nothing.
            for version in os.listdir(mig):
                vdir = os.path.join(mig, version)
                if os.path.isdir(vdir) and any(
                        f.endswith(".py") for f in os.listdir(vdir)):
                    found.add(module)
                    break
    return found


def main():
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    path = os.path.join(repo, "construction-erp", "release",
                        "migration-contract.json")
    errors = []

    if not os.path.exists(path):
        print(f"FAIL: no migration contract at {path}", file=sys.stderr)
        print("Every release must declare whether the previous image can still "
              "read a database this one has migrated.", file=sys.stderr)
        return 1

    try:
        with open(path, encoding="utf-8") as fh:
            contract = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"FAIL: contract is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if contract.get("schema") != 1:
        errors.append(f"schema must be 1, got {contract.get('schema')!r}")

    flag = contract.get("flag")
    if flag not in FLAGS:
        errors.append(f"flag must be one of {FLAGS}, got {flag!r}")

    declared = contract.get("modules_with_migrations")
    if not isinstance(declared, list) or any(
            not isinstance(m, str) for m in declared):
        errors.append("modules_with_migrations must be a list of strings")
        declared = []

    notes = contract.get("notes", "")
    if not isinstance(notes, str) or len(notes.strip()) < 30:
        errors.append("notes must explain the flag in at least a sentence; "
                      "a bare flag is a number nobody can check")

    actual = find_modules_with_migrations(repo)
    declared_set = set(declared)

    undeclared = actual - declared_set
    if undeclared:
        errors.append(
            "these modules ship migrations but the contract does not list "
            f"them: {sorted(undeclared)}. Add them, and re-decide the flag -- "
            "a new migration is exactly when the previous answer stops being "
            "valid.")

    phantom = declared_set - actual
    if phantom:
        errors.append(
            "the contract lists modules with no migration scripts: "
            f"{sorted(phantom)}. Remove them so the list stays trustworthy.")

    if flag == "none" and actual:
        errors.append(
            f"flag is 'none' but {sorted(actual)} ship migrations. 'none' "
            "means the release migrates nothing.")

    if errors:
        print("FAIL: migration contract", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"migration contract OK: flag={flag}, "
          f"modules={sorted(declared_set) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
