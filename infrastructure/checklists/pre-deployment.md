# Pre-deployment checklist

Every item starts unchecked. Mark an item complete only after recording evidence, date, and reviewer in the deployment record. This checklist prepares a review; it does not authorize deployment.

## Ownership and scope

- [ ] Mohamed approved that this server is for demo, staging, internal testing, CI/CD, monitoring, and deployment automation only.
- [ ] Paying-customer production data is prohibited and technically/operationally communicated.
- [ ] The exact public hostname is approved.
- [ ] The server owner, technical owner, security contact, and incident contact are recorded.
- [ ] Draft RPO (24 hours) and RTO (4 hours) are accepted or replaced.
- [ ] A maintenance window and change approver are named.

## Provider and DNS

- [ ] Hetzner account and MajalOps vault both enforce MFA; recovery codes are stored separately.
- [ ] Dedicated Hetzner project exists.
- [ ] CPX22, Nuremberg, Ubuntu 24.04 LTS, server name, labels, backups, and deletion protection are reviewed.
- [ ] Hetzner firewall permits only reviewed SSH, HTTP, HTTPS, and required ICMP traffic.
- [ ] No PostgreSQL, Docker, Majal/Odoo, metrics, or dashboard port is publicly open.
- [ ] Current DNS records and rollback values are exported.
- [ ] `A` record target is correct; `AAAA` is included only after IPv6 verification.
- [ ] DNS resolves correctly from at least two independent resolvers.

## SSH and host security

- [ ] Mohamed's dedicated Ed25519 key has a strong passphrase and approved encrypted backup.
- [ ] Only the public key is registered in Hetzner.
- [ ] Initial host fingerprint is verified and recorded.
- [ ] Named non-root administrator exists with its own key.
- [ ] A separate non-root SSH session and `sudo -v` have succeeded.
- [ ] SSH configuration rollback copy and Hetzner snapshot exist before lockdown.
- [ ] `sshd -t` passes.
- [ ] Effective configuration is key-only; root and password login tests fail.
- [ ] fail2ban is enabled and the SSH jail is active.
- [ ] UFW rollback command is ready and the original SSH session remains open before enablement.

## Host baseline

- [ ] Package updates complete and pending reboot status is known.
- [ ] Hostname is `majalops-platform-01`.
- [ ] Timezone is UTC and chrony reports synchronization.
- [ ] Locale is `en_US.UTF-8` (application languages remain independent).
- [ ] Unattended security upgrades are enabled and configured not to reboot automatically.
- [ ] auditd is active and rules load without error.
- [ ] Swap size and swappiness are verified.
- [ ] MajalOps log rotation validates without error.
- [ ] Disk layout, free space, inode capacity, memory, CPU count, and load baseline are recorded.

## Docker and configuration review

- [ ] Docker Engine source and signing key are official and reviewed.
- [ ] Docker Engine and Compose plugin versions are approved.
- [ ] `/etc/docker/daemon.json` validates and log limits are active.
- [ ] Docker starts automatically after reboot.
- [ ] Routine users are not in the root-equivalent Docker group unless explicitly approved.
- [ ] Compose file passes `docker compose config --quiet` without starting services.
- [ ] Caddyfile passes `caddy validate` in a disposable/local validation context.
- [ ] Only Caddy publishes host ports.
- [ ] Docker/UFW interaction is reviewed and an external scan confirms no published port bypasses the intended firewall boundary.
- [ ] PostgreSQL is on an internal Docker network with no host binding.
- [ ] All images are replaced with reviewed immutable digests.
- [ ] The backup helper image is pre-pulled and pinned to a reviewed immutable digest.
- [ ] Persistent-volume ownership and expected application UID/GID are confirmed.

## Secrets

- [ ] 1Password Business or Bitwarden is selected, MFA-protected, and access-reviewed.
- [ ] `/etc/majalops/platform.env` is root-owned mode `0600` and excluded from Git/backups that lack encryption.
- [ ] PostgreSQL, database-manager, and AI master secrets are unique random values.
- [ ] No secret appears in Git history, image layers, Compose output, shell history, screenshots, tickets, or logs.
- [ ] Registry, DNS, backup, monitoring, and AI provider credentials use least privilege.
- [ ] Rotation owners and emergency-revocation steps are recorded.

## Application readiness dependencies

- [ ] Every item in `REQUIRED_APP_CHANGES.md` has an owner and decision.
- [ ] A Majal image is built, scanned, tested, and published by immutable digest.
- [ ] Reverse-proxy and worker/websocket behavior are tested.
- [ ] Database-aware health behavior is agreed.
- [ ] Database migration and rollback compatibility are documented for the selected release.

## Recovery readiness

- [ ] Pre-change Hetzner snapshot procedure is tested.
- [ ] Local database + filestore backup succeeds and checksums pass.
- [ ] Encrypted off-host copy succeeds under a separate account/provider boundary.
- [ ] Disposable-environment restore succeeds and evidence is recorded.
- [ ] Backup-age and restore-test-age alerts are configured.
- [ ] Previous immutable image digest is available for rollback.
- [ ] Disaster recovery contacts, vault recovery, DNS rollback, and server rebuild inputs are accessible.
