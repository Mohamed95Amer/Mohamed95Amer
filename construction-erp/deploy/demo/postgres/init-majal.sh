#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "DB_PASSWORD is required" >&2
    exit 1
fi

psql --set=ON_ERROR_STOP=1 \
     --set=app_password="$DB_PASSWORD" \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" <<'SQL'
SELECT format(
    'CREATE ROLE majal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
    :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'majal_app')
\gexec

SELECT 'CREATE DATABASE erp OWNER majal_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'erp')
\gexec
SQL
