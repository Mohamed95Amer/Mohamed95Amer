#!/usr/bin/env python3
"""Offline Majal recovery executor.

This script is intentionally not reachable from an HTTP route. It runs in a
one-off application container after the live application has been stopped.
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone


BACKUP_ROOT = "/var/lib/odoo/majal_backups"
DATA_ROOT = "/var/lib/odoo/filestore"
VALID_SLOTS = {
    "today",
    "yesterday",
    "day_before",
    "weekly",
    "fortnight",
    "monthly",
    "quarterly",
}


def fail(message):
    print("ERROR: %s" % message, file=sys.stderr)
    raise SystemExit(1)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command, environment, input_path=None):
    stdin = open(input_path, "rb") if input_path else subprocess.DEVNULL
    try:
        result = subprocess.run(
            command,
            env=environment,
            stdin=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
    finally:
        if input_path:
            stdin.close()
    if result.returncode:
        output = result.stdout.decode("utf-8", errors="replace")[-3000:]
        raise RuntimeError("%s\n%s" % (" ".join(command[:3]), output))
    return result.stdout


def sql(environment, statement, database="postgres"):
    return run(
        [
            "psql",
            "--no-psqlrc",
            "--set=ON_ERROR_STOP=1",
            "--dbname=%s" % database,
            "--command=%s" % statement,
        ],
        environment,
    )


def quote_identifier(value):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value or ""):
        fail("Unsafe database identifier in recovery request.")
    return '"%s"' % value.replace('"', '""')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slot", choices=sorted(VALID_SLOTS), required=True)
    parser.add_argument("--code", required=True)
    args = parser.parse_args()

    marker_path = os.path.join(BACKUP_ROOT, "restore-request.json")
    if not os.path.isfile(marker_path):
        fail("No prepared restore request was found.")
    with open(marker_path, encoding="utf-8") as marker_stream:
        marker = json.load(marker_stream)

    if marker.get("slot") != args.slot:
        fail("The requested recovery slot does not match the prepared request.")
    actual_token = hashlib.sha256(args.code.encode()).hexdigest()
    if not hmac.compare_digest(actual_token, marker.get("token_hash", "")):
        fail("The one-time recovery code is invalid.")
    expires_at = datetime.fromisoformat(marker["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        fail("The prepared restore request has expired.")

    database = marker["database"]
    database_ident = quote_identifier(database)
    archive_path = os.path.realpath(os.path.join(BACKUP_ROOT, marker["archive"]))
    if not archive_path.startswith(os.path.realpath(BACKUP_ROOT) + os.sep):
        fail("The archive path escaped the protected recovery directory.")
    if not os.path.isfile(archive_path):
        fail("The selected recovery archive is missing.")
    if not hmac.compare_digest(sha256(archive_path), marker["checksum"]):
        fail("The selected recovery archive checksum does not match.")

    admin_password = os.environ.get("MAJAL_DB_ADMIN_PASSWORD")
    app_password = os.environ.get("MAJAL_DB_APP_PASSWORD")
    host = os.environ.get("HOST", "db")
    admin_user = os.environ.get("MAJAL_DB_ADMIN_USER", "odoo")
    app_user = os.environ.get("USER", "majal_app")
    if not admin_password or not app_password:
        fail("Database recovery credentials were not supplied.")

    base_environment = os.environ.copy()
    base_environment.update({"PGHOST": host, "PGPORT": "5432"})
    admin_environment = {
        **base_environment,
        "PGUSER": admin_user,
        "PGPASSWORD": admin_password,
    }
    app_environment = {
        **base_environment,
        "PGUSER": app_user,
        "PGPASSWORD": app_password,
    }

    suffix = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    safety_database = "%s_pre_restore_%s" % (database, suffix)
    safety_ident = quote_identifier(safety_database)
    filestore = os.path.join(DATA_ROOT, database)
    safety_filestore = "%s.pre_restore_%s" % (filestore, suffix)
    renamed_database = False
    installed_database = False
    moved_filestore = False

    with tempfile.TemporaryDirectory(prefix="majal-restore-", dir=BACKUP_ROOT) as work:
        with zipfile.ZipFile(archive_path, "r") as archive:
            if archive.testzip():
                fail("The archive failed its final ZIP integrity test.")
            names = set(archive.namelist())
            if {"dump.sql", "manifest.json"} - names:
                fail("The archive is missing its database dump or manifest.")
            archive.extractall(work)

        dump_path = os.path.join(work, "dump.sql")
        try:
            sql(
                admin_environment,
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = '%s' AND pid <> pg_backend_pid();"
                % database.replace("'", "''"),
            )
            sql(
                admin_environment,
                "ALTER DATABASE %s RENAME TO %s;" % (database_ident, safety_ident),
            )
            renamed_database = True
            sql(
                admin_environment,
                "CREATE DATABASE %s OWNER %s TEMPLATE template0 ENCODING 'UTF8';"
                % (database_ident, quote_identifier(app_user)),
            )
            installed_database = True
            run(
                [
                    "psql",
                    "--no-psqlrc",
                    "--set=ON_ERROR_STOP=1",
                    "--dbname=%s" % database,
                ],
                app_environment,
                input_path=dump_path,
            )

            if os.path.isdir(filestore):
                os.replace(filestore, safety_filestore)
                moved_filestore = True
            restored_filestore = os.path.join(work, "filestore")
            if os.path.isdir(restored_filestore):
                shutil.copytree(restored_filestore, filestore)
            else:
                os.makedirs(filestore, mode=0o700, exist_ok=True)

            sql(
                app_environment,
                "SELECT name FROM ir_module_module WHERE state = 'installed' LIMIT 1;",
                database=database,
            )
            sql(
                admin_environment,
                "DROP DATABASE %s;" % safety_ident,
            )
            renamed_database = False
            if moved_filestore and os.path.isdir(safety_filestore):
                shutil.rmtree(safety_filestore)
            os.remove(marker_path)
            print("Majal restore completed and validated for database '%s'." % database)
        except Exception as error:
            print("Restore failed; rolling the original database back.", file=sys.stderr)
            try:
                if installed_database:
                    sql(
                        admin_environment,
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = '%s' AND pid <> pg_backend_pid();"
                        % database.replace("'", "''"),
                    )
                    sql(admin_environment, "DROP DATABASE %s;" % database_ident)
                if renamed_database:
                    sql(
                        admin_environment,
                        "ALTER DATABASE %s RENAME TO %s;"
                        % (safety_ident, database_ident),
                    )
                if os.path.isdir(filestore):
                    shutil.rmtree(filestore)
                if moved_filestore and os.path.isdir(safety_filestore):
                    os.replace(safety_filestore, filestore)
            except Exception as rollback_error:
                fail(
                    "Restore and automatic rollback both failed. Restore error: %s; "
                    "rollback error: %s" % (error, rollback_error)
                )
            fail("Restore was rolled back safely: %s" % error)


if __name__ == "__main__":
    main()
