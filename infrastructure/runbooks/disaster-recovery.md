# Disaster recovery

## Recovery priorities

1. Protect people, credentials, evidence, and unaffected systems.
2. Revoke compromised access before rebuilding.
3. Restore infrastructure from reviewed code, not from an untrusted host filesystem.
4. Restore the matched database and filestore backup.
5. Validate security and business functions before DNS cutover.

## Inputs required

- Hetzner account and MFA recovery access.
- DNS provider access and current record export.
- 1Password/Bitwarden recovery access.
- Current administrator public keys; no shared private keys.
- Reviewed infrastructure directory and release image digest.
- Off-host encrypted backup and its encryption credential.
- Last known-good database/filestore backup checksum.
- Server asset record, firewall rules, RPO/RTO, and contact list.

## Complete-server loss

Risk: accidental cutover to an incomplete or compromised environment. Rollback: keep old DNS records and TTLs documented; use a new hostname for validation before production DNS changes.

1. Declare an incident and preserve provider/audit evidence.
2. Determine whether credentials must be revoked before recovery.
3. Create a replacement CPX22 on Ubuntu 24.04 in Nuremberg or an approved alternate region.
4. Attach the reviewed Hetzner firewall and a known-good Ed25519 key.
5. Follow `first-server-setup.md` through staged SSH, UFW, and Docker installation.
6. Install the reviewed Compose/Caddy configuration and exact last-known-good image digest; run `docker compose create majal` so the empty persistent volume/container exists for the guarded restore.
7. Retrieve an off-host backup over an authenticated encrypted channel.
8. Verify checksums and restore database + filestore.
9. Validate with the post-deployment checklist on a temporary hostname or local host override.
10. Lower/confirm DNS TTL, change DNS, verify globally, and monitor.
11. Rotate recovered secrets if the old host may have been compromised.
12. Keep the failed host isolated until evidence retention is approved.

## Database or filestore corruption

Stop writes, create a forensic/safety copy, determine the last known-good paired backup, and use `backup-and-restore.md`. Never restore only the database or only the filestore unless the incident owner accepts attachment inconsistency.

## Secret compromise

Revoke the exposed credential first. Rotate in this order where applicable: administrator SSH keys, vault sessions, registry credentials, backup credentials/encryption keys, PostgreSQL/application secrets, AI provider keys, DNS/API tokens, and monitoring credentials. Recreate affected containers and validate that old values fail.

## Docker host compromise

Do not trust containers, images, volumes, environment files, or backups created after the earliest suspected compromise. Rebuild a fresh server, pull images by verified digest, restore a pre-compromise off-host backup, rotate all server-readable secrets, and review outbound/inbound activity.

## Acceptance and review

Recovery is complete only after SSH, firewall, HTTPS, Docker, PostgreSQL, application health, authentication, attachments, backups, monitoring, CPU/memory/disk, automatic startup, and business smoke checks pass with recorded evidence. Conduct a post-incident review and update this runbook without deleting evidence.
