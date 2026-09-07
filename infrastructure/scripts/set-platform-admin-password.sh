#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

ENV_FILE="${ENV_FILE:-/etc/majalops/platform.env}"
APP_CONTAINER="${APP_CONTAINER:-majalops-platform-majal-1}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin@majalops.com}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die "Run as root."
[[ -f "$ENV_FILE" ]] || die "Platform environment not found: $ENV_FILE"
[[ "$ADMIN_LOGIN" == *@*.* ]] || die "ADMIN_LOGIN is invalid."
command -v base64 >/dev/null || die "base64 is required."
command -v docker >/dev/null || die "docker is required."

IFS= read -r password_b64 || die "No password payload was received."
# Windows PowerShell writes CRLF when piping text to ssh; remove the transport CR.
password_b64="${password_b64%$'\r'}"
[[ "$password_b64" =~ ^[A-Za-z0-9+/]+={0,2}$ ]] || die "Invalid password payload."
password="$(printf '%s' "$password_b64" | base64 --decode)" || die "Invalid password payload."
(( ${#password} >= 16 )) || die "The password must contain at least 16 characters."
[[ "$password" != *$'\n'* && "$password" != *$'\r'* ]] || die "The password cannot contain line breaks."
LC_ALL=C
[[ "$password" != *[[:space:]]* ]] || die "The password cannot contain spaces."
[[ "$password" != *"'"* ]] || die "The password cannot contain apostrophes."
# Bracket expression rather than a quoted backslash: the two match the same
# thing, but shellcheck reads the quoted form as a mis-escaped apostrophe
# (SC1003) and the bracket form says "a literal backslash" unambiguously.
[[ "$password" != *[\\]* ]] || die "The password cannot contain backslashes."
[[ "$password" != *[![:print:]]* ]] || die "Use printable English characters only."

tmp="${ENV_FILE}.tmp.$$"
found=0
while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == MAJAL_INITIAL_ADMIN_PASSWORD=* ]]; then
        printf "MAJAL_INITIAL_ADMIN_PASSWORD='%s'\n" "$password" >> "$tmp"
        found=1
    else
        printf '%s\n' "$line" >> "$tmp"
    fi
done < "$ENV_FILE"
(( found == 1 )) || printf "MAJAL_INITIAL_ADMIN_PASSWORD='%s'\n" "$password" >> "$tmp"
chmod 0600 "$tmp"
chown root:root "$tmp"
mv "$tmp" "$ENV_FILE"

{
    printf '%s\n' 'import base64'
    printf 'password = base64.b64decode("%s").decode("utf-8")\n' "$password_b64"
    printf 'admin = env.ref("base.user_admin")\n'
    printf 'admin.write({"login": "%s", "password": password})\n' "$ADMIN_LOGIN"
    printf 'env.cr.commit()\n'
    printf 'print("MajalOps administrator password updated.")\n'
} | docker exec -i "$APP_CONTAINER" \
    /usr/local/bin/majal-entrypoint odoo shell -d majal --no-http

unset password password_b64
printf 'Administrator login retained as %s. Password updated without logging its value.\n' "$ADMIN_LOGIN"
