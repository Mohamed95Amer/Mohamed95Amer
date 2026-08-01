# MajalOps platform infrastructure

This directory is the complete automation layer for `majalops-platform-01`: a Hetzner CPX22 Ubuntu 24.04 platform server for demo, staging, internal testing, CI/CD, monitoring, and deployment automation. It is not approved for paying-customer production data.

## Automated architecture

- `platform.majalops.com` resolves through Cloudflare; Caddy is the only public application edge and obtains/renews HTTPS certificates automatically.
- Majal and PostgreSQL run as containers on a private backend network. Neither publishes a host port.
- Prometheus and Alertmanager bind to server loopback only; exporters stay on internal Docker networks.
- systemd starts the stack after reboot and runs bounded health recovery every minute.
- paired PostgreSQL/filestore backups are encrypted by restic and can target Backblaze B2 or Cloudflare R2.
- GitHub Actions builds an immutable GHCR image, creates SBOM/provenance attestations, tags semantic releases, and deploys through a forced-command Ed25519 key.
- Hetzner firewall/protection/backups and Cloudflare DNS/TLS settings are applied idempotently through scoped API tokens.

## Layout

| Folder | Purpose |
|---|---|
| `scripts/` | Host bootstrap, provisioning, provider APIs, deployment, backup, restore, monitoring, recovery, and one-command orchestration. |
| `docker/` | Production image, Compose stack, generated-environment template, and hash-locked Python dependencies. |
| `caddy/` | HTTPS reverse proxy, security headers, bounded access logs, and health routing. |
| `monitoring/` | Prometheus, Alertmanager, exporters, probes, alert expressions, and channel configuration. |
| `backups/` | Retention and storage boundary; real encrypted backups never live in Git. |
| `systemd/` | Startup, health-recovery, backup, and repository-check services/timers. |
| `cloudflare/` | Secret-free DNS record specification. |
| `hetzner/` | Secret-free cloud-firewall specification. |
| `runbooks/` | Security, deployment, recovery, and owner-authenticated procedures. |
| `checklists/` | Evidence gates; unchecked means not verified on the real server. |

Generated credentials, private keys, provider output, and downloaded release references live in ignored `infrastructure/.generated/`.

## One-command Phase 2 path

After creating the scoped credentials described in `runbooks/phase2-owner-actions.md`, use the masked-input launcher:

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure\scripts\start-phase2-secure.ps1 `
  -TlsEmail 'operations@majalops.com' `
  -EnableExternalHealth
```

The orchestrator creates and attests a semantic release, applies Hetzner and Cloudflare controls, provisions the host, configures restricted GitHub deployment, and verifies public HTTPS. It stops on the first failed gate and does not suppress errors.

## Security invariants

- Individual Ed25519 administrator keys; no shared private key and no SSH passwords.
- Root SSH is disabled only after a tested non-root sudo session exists.
- UFW and Hetzner Cloud Firewall expose only SSH, HTTP, HTTPS, and ICMP diagnostics.
- Real secrets are root-owned mode `0600`, GitHub encrypted secrets, or a restricted 1Password/Bitwarden vault.
- Deployment accepts only `ghcr.io/mohamed95amer/majalops-platform@sha256:...` through a forced command and an allow-listed root wrapper.
- Production Python packages and container deployments are immutable/hash-pinned; mutable tags are only resolved once into digests.
- Automatic recovery never restarts an unhealthy PostgreSQL container and stops after three attempts in 30 minutes.

Review `VALIDATION.md`, then follow `runbooks/phase2-owner-actions.md`. No script should be run on the server until its rollback statement and the pre-deployment checklist have been reviewed.
