# MajalOps platform server record

This file is the review-safe server-documentation template requested for the platform. Populate actual identifiers and evidence only after the server is created. Do not place passwords, private keys, API tokens, recovery codes, or decrypted backup keys here.

## Identity and purpose

| Field | Planned value / verified value |
|---|---|
| Provider | Hetzner Cloud |
| Project | `TO_RECORD_AFTER_CREATION` |
| Server name | `majalops-platform-01` |
| Server ID | `TO_RECORD_AFTER_CREATION` |
| Server type | CPX22 |
| Location | Nuremberg |
| Operating system | Ubuntu 24.04 LTS |
| Public IPv4 | `TO_RECORD_AFTER_CREATION` |
| Public IPv6 | `TO_DECIDE` |
| Public hostname | `platform.majalops.com` — pending Mohamed's confirmation |
| Purpose | Demo, staging, internal testing, CI/CD, monitoring and deployment automation |
| Data classification | No paying-customer production data |
| Technical owner | Mohamed — exact contact to record |
| Incident contact | `TO_RECORD` |

## DNS record

Record the DNS provider, zone owner, record IDs, `A`/approved `AAAA` values, TTL, last change, approver, and rollback values. Never record the DNS API token here.

## Network and firewall

The intended inbound surface is:

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| 22 | TCP | Mohamed's approved CIDR where practical | Key-only SSH |
| 80 | TCP | Internet | ACME and HTTPS redirect |
| 443 | TCP | Internet | MajalOps HTTPS |

PostgreSQL 5432, Majal 8069, Docker, metrics exporters, and monitoring interfaces must not be public. Record Hetzner Firewall ID/rules and the verified `ufw status verbose` output location after creation.

## SSH and access

Record host-key fingerprints, named administrator accounts, individual public-key fingerprints, issue/review/revocation dates, sudo authorization, and the date root/password login were verified disabled. Store private keys only in the approved vault/device locations described in `security-hardening.md`.

## Docker and application runtime

Record:

- Docker Engine and Compose plugin versions.
- `/etc/docker/daemon.json` checksum.
- Compose file and Caddyfile checksums.
- Caddy, PostgreSQL, Majal, and backup-helper immutable image digests.
- Compose project name, persistent volume names, and expected UID/GID ownership.
- Last deployment, previous digest, approver, validation evidence, and rollback expiry.

## PostgreSQL

Record major/minor version, database name, role names without passwords, encoding/locale, data-checksum verification, database size, connection limit, backup method, and last successful restore drill. PostgreSQL must remain internal to Docker.

## Backups

| Item | Planned value / verified value |
|---|---|
| Local path | `/srv/majalops/backups` |
| Contents | PostgreSQL custom dump + filestore + metadata + SHA-256 checksums |
| Local retention | 30 days |
| Off-host retention | 7 daily, 4 weekly, 3 monthly |
| Off-host provider/bucket | `TO_DECIDE` |
| Encryption owner | Vault entry name only; no key value |
| RPO | Proposed 24 hours; approval pending |
| RTO | Proposed 4 hours; approval pending |
| Last successful backup | `TO_VERIFY` |
| Last checksum verification | `TO_VERIFY` |
| Last disposable restore | `TO_VERIFY` |

## Monitoring

Record off-host health monitor, Hetzner alerts, notification owner, escalation path, alert thresholds, last deliberate alert test, TLS-expiry alert, disk/inode alert, memory/CPU/load alert, container restart alert, PostgreSQL alert, backup-age alert, and restore-test-age alert. Do not publish monitoring ports.

## Installed software inventory

After bootstrap, record exact package versions for Ubuntu kernel, OpenSSH, UFW, fail2ban, auditd, chrony, unattended-upgrades, Docker Engine, containerd, Compose, Caddy image, PostgreSQL image, and Majal image. Store an exported package list with the change evidence—not secrets.

## Recovery information

Record the Hetzner snapshot/backup policy, rescue-mode procedure location, DNS rollback record, infrastructure source commit, last-known-good image digest, off-host backup location, vault recovery owners, and disaster-recovery test date. Reference `disaster-recovery.md`; do not duplicate recovery credentials here.

## Change history

For each material server change, record UTC timestamp, operator, ticket/change reason, pre-change snapshot/backup, exact commands or automation version, before/after image/config checksums, verification evidence, rollback decision, and cleanup date.
