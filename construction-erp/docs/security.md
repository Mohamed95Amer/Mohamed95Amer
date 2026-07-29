# Majal security baseline

Majal uses Odoo's maintained authentication and authorization primitives. It
does not implement a second password or session system.

## Active in the local Docker profile

- Only the `erp` database can be selected (`db_name` and `dbfilter`).
- Database listing and the browser database manager are disabled.
- Reverse-proxy headers are not trusted while Majal is running directly on
  `127.0.0.1`.
- The local profile uses `workers = 0`, keeping browser websocket traffic on
  port 8069 and avoiding an incorrectly exposed evented port. Production
  worker mode must proxy `/websocket` to Odoo's evented service.
- The running web application connects as `majal_app`, a PostgreSQL role with
  no superuser, database-creation or role-creation privileges.
- The PostgreSQL bootstrap owner and Odoo master password are independent,
  randomly generated values stored only in the ignored `.env` file.
- The production worker profile is prepared to recycle after 4,096 requests;
  CPU and wall-clock limits remain configured.
- `majal_security` installs Odoo's password policy, passkey and TOTP/email-MFA
  modules. New or changed passwords must contain at least 12 characters.
- `majal_administration` provides six rank-checked client roles, prevents
  client administrators from editing raw technical groups, blocks
  deactivation of the last Platform Owner, and keeps immutable administration
  events.
- Twelve optional capability tiers grant only explicitly selected Procurement,
  Inventory, Finance, HR, Website or AI Administration access. One tier is
  allowed per family, every tier has a minimum Majal role, and high-risk
  Finance/HR/Website administration requires Platform Owner approval.
- Majal creates seven local database-and-filestore recovery tiers with
  integrity checks. Restore requires a short-lived Platform Owner request and
  a separate offline deployment-operator action.

## Administrator actions before internet exposure

1. Set a real public `web.base.url` using HTTPS.
2. Configure outgoing email and test delivery.
3. In **Settings → Permissions**, enroll administrators in a passkey or TOTP.
4. Only after mail delivery is verified, enable the built-in policy requiring
   2FA for internal users. Enforcing email 2FA before mail works can lock out
   every user, so Majal does not enable that switch automatically.
5. Put Majal behind a maintained reverse proxy, enable `proxy_mode`, terminate
   TLS there, rate-limit authentication, and block direct access to port 8069.
6. Replace or remove demo users and demo data. Do not expose this demo database
   to the internet.
7. Configure encrypted off-machine replication for Majal recovery points and
   run a documented restore drill. Local recovery points alone do not protect
   against host or account loss.

## Authorization policy

- Internal staff receive only the modules and project/facility records needed
  for their work.
- A Majal role change is a strict allowlist. Optional business access is
  retained only when it remains explicitly selected as a valid capability
  pack; removing the pack removes its technical groups.
- HR access is deliberately separated from upstream Maintenance
  Administration, preventing an HR Officer pack from silently granting
  facility-equipment control.
- Portal users stay on portal routes and must never receive internal-user
  groups.
- Asset QR/NFC routes require an authenticated user and normal record access.
- Physical-tag tokens are identifiers, not credentials. They are unguessable
  and rotatable, but possession of a tag never bypasses login or record rules.
- Scan events are append-only evidence: users can create and read permitted
  events but cannot edit or delete them.

## Reference baseline

- [Odoo 18 deployment security](https://www.odoo.com/documentation/18.0/administration/on_premise/deploy.html)
- [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

No software can promise protection from every issue. This baseline reduces the
largest current risks; production still needs TLS, monitoring, backups, patching
and periodic access reviews.
