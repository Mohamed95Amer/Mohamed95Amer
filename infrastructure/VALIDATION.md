# Infrastructure validation record

Date: 2026-07-31
Scope: local release-readiness validation. No Hetzner, Cloudflare, GitHub account, DNS, or server state was changed.

## Passed locally

- Every `.sh` plus the extensionless restricted deployment commands passes `bash -n` using Git Bash.
- All shell files pass ShellCheck 0.11.0 through style severity with no findings.
- Every PowerShell script passes the Windows PowerShell 5.1 AST parser.
- All three new GitHub workflows pass actionlint 1.7.12, including embedded ShellCheck.
- Base Compose and the monitoring overlay pass Docker Compose 5.3.1 rendering.
- Rendered isolation invariants pass: only Caddy publishes 80/443; Majal and PostgreSQL publish no ports; Prometheus and Alertmanager bind only to `127.0.0.1`; backend and monitoring networks are internal.
- Caddy 2.11.4 validates the production Caddyfile and confirms automatic HTTPS redirects.
- Prometheus 3.13.2 validates all eight alert rules.
- Alertmanager 0.33.1 validates a generated configuration containing email, Slack, Microsoft Teams v2, Discord, and generic webhook receivers.
- Production Python requirements are exact-version and SHA-256 locked; pip TLS verification remains enabled; test-only `odoo-test-helper` is excluded from the production image.
- The infrastructure tree contains no private key, provider token, GitHub token, `.generated` output, or real environment file.
- Existing application modules, API code, local Compose/Dockerfiles, existing documentation, existing CI, and `README.md` remain untouched.

The validators were downloaded from official project releases into a disposable `C:\tmp` directory and verified against published checksums or GitHub release-asset SHA-256 digests. Hadolint's Windows binary was also checksum-verified but did not finish executing under the local sandbox; GitHub CI therefore performs Docker's native `docker build --check` gate.

## Intentionally unverified until authenticated execution

- Real Hetzner server identity, firewall attachment, backup enablement, delete/rebuild protection, snapshot, and rescue access.
- Real Cloudflare zone access, DNS propagation, proxy state, zone TLS settings, certificate issuance, and external port scan.
- Host SSH login/rejection evidence, UFW, fail2ban, auditd, chrony, unattended upgrades, swap, reboot, Docker daemon, and systemd timers.
- GHCR build/push/attestation, private image pull, release tag, GitHub environments, and restricted deployment key.
- PostgreSQL initialization/data checksums, Majal module installation, Arabic language, workers, jobs, attachments, BIM, and Intelligence.
- Real paired backup, encrypted B2/R2 upload, repository check, disposable restore drill, and notification delivery.
- CPU/RAM/disk behavior under representative demo load.

These gates remain unchecked in `checklists/pre-deployment.md` and `checklists/post-deployment.md` until the automation records evidence from the actual server.
