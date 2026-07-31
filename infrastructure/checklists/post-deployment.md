# Post-deployment validation checklist

Nothing is complete until verified after deployment or recovery. Record command output, timestamp, environment, reviewer, and any exception. A screenshot without the underlying value is insufficient for security-critical checks.

## SSH

- [ ] `ssh majaladmin@SERVER_IP` succeeds using the approved Ed25519 key from a new terminal.
- [ ] `sudo -v` succeeds for the approved administrator.
- [ ] Root SSH login fails.
- [ ] Password and keyboard-interactive SSH login fail.
- [ ] `sshd -t` passes and effective settings match the security runbook.
- [ ] Unauthorized/test key fails; authorized-key fingerprints match the access register.
- [ ] fail2ban SSH jail is active and logs are present.

## Firewall and exposed network

- [ ] `ufw status verbose` shows default-deny inbound and only SSH, 80, and 443 allowances.
- [ ] Hetzner Cloud Firewall matches the approved rules.
- [ ] External scan finds only the expected SSH, HTTP, and HTTPS ports.
- [ ] Ports 5432, 8069, Docker, metrics, and monitoring UIs are not publicly reachable.
- [ ] SSH still works from a second session after UFW enablement.

## Docker and Compose

- [ ] `systemctl is-enabled docker` and `systemctl is-active docker` both succeed.
- [ ] `docker version` shows supported Engine/client versions.
- [ ] `docker compose version` succeeds.
- [ ] `docker compose ... config --quiet` succeeds.
- [ ] All deployed images use the approved immutable digests.
- [ ] All expected containers are running and healthy without restart loops.
- [ ] Docker log rotation limits are active.
- [ ] PostgreSQL has no published host port; only Caddy publishes 80/443.

## HTTPS and DNS

- [ ] DNS `A` and approved `AAAA` records resolve to this server.
- [ ] HTTP redirects to HTTPS.
- [ ] HTTPS certificate hostname, chain, validity, and automated renewal behavior pass.
- [ ] TLS 1.2/1.3 work; obsolete protocols and weak ciphers do not.
- [ ] Security headers are present and application pages/assets/websockets still work.
- [ ] Direct public access to port 8069 fails.

## Majal health and application smoke

- [ ] `https://APPROVED_HOSTNAME/healthz` returns a 2xx response through Caddy.
- [ ] `healthcheck.sh` returns zero.
- [ ] English and Arabic login/rendering work in current desktop and mobile browsers.
- [ ] Approved administrator can log in; unauthorized access is rejected.
- [ ] Construction and facilities landing pages load.
- [ ] Attachments/filestore read and write succeed using test-only data.
- [ ] BIM safe view and required static libraries load where applicable.
- [ ] Majal Intelligence provider connectivity is tested with a non-production key where applicable.
- [ ] Background jobs and scheduled actions run once, not in duplicate.
- [ ] Application and Caddy logs show no repeated error or secret leakage.

## PostgreSQL

- [ ] `pg_isready` passes for the configured database.
- [ ] Application connects using the intended role/database.
- [ ] No default or unnecessary database is exposed through the application.
- [ ] Database size, active connections, locks, and error log baseline are recorded.
- [ ] Data checksums were enabled at initialization.
- [ ] A test record and attachment survive an application-container recreation.

## Backups and recovery

- [ ] `backup.sh` creates both `database.dump` and `filestore.tar.gz`.
- [ ] `sha256sum --check SHA256SUMS` passes.
- [ ] Completed backup is copied off-host with encryption.
- [ ] Off-host retention/lifecycle implements 7 daily, 4 weekly, and 3 monthly points.
- [ ] Disposable-environment restore succeeds using `restore.sh`.
- [ ] Restored login, data, attachments, jobs, Arabic/English UI, and health checks pass.
- [ ] Backup-age and restore-drill alerts are received by the designated owner.

## Monitoring and resources

- [ ] Off-host HTTPS monitor detects both healthy and deliberately failed states.
- [ ] Hetzner server-down alert is received.
- [ ] CPU usage/count/load baseline and alert threshold are recorded.
- [ ] Memory usage, pressure, swap, and alert threshold are recorded.
- [ ] Root disk and Docker-volume usage stay below 80%; alert triggers are tested.
- [ ] Inode usage is monitored.
- [ ] Container down/restart alerts are tested.
- [ ] PostgreSQL unavailable and backup stale alerts are tested.
- [ ] TLS expiry and DNS failure alerts are tested.
- [ ] Chrony synchronization and clock-drift alert are verified.

## Automatic startup and reboot

- [ ] A planned reboot has an approved rollback/recovery window.
- [ ] SSH, UFW, fail2ban, auditd, chrony, unattended upgrades, Docker, Caddy, Majal, and PostgreSQL return automatically.
- [ ] Health endpoint recovers without manual container starts.
- [ ] Persistent database and filestore data remain intact.
- [ ] No unexpected service binds a public port after reboot.

## Acceptance

- [ ] All critical failures are resolved; no security or data-recovery exception remains.
- [ ] Mohamed reviewed the evidence and explicitly accepted the platform state.
- [ ] Server asset record, software inventory, access register, DNS/firewall values, image digests, backup location, and recovery contacts are updated.
- [ ] Snapshot and rollback artifacts have defined retention/removal dates.
