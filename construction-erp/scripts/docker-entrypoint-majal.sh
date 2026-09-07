#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${ODOO_ADMIN_PASSWD:-}" ]]; then
    echo "ODOO_ADMIN_PASSWD is required" >&2
    exit 1
fi

# The committed config contains no secret. Build a short-lived copy inside the
# container, readable only by the Odoo user/process, then let the official
# image entrypoint add the database connection arguments as usual.
runtime_config="/tmp/majal-odoo.conf"
umask 077
cp /etc/odoo/odoo.conf "$runtime_config"
printf '\nadmin_passwd = %s\n' "$ODOO_ADMIN_PASSWD" >> "$runtime_config"
export ODOO_RC="$runtime_config"

exec /entrypoint.sh "$@"
