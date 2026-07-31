# First server setup

Nothing in this runbook has been executed. Every checkbox in the pre-deployment checklist starts unverified.

## 1. Before creating the server

Rollback for the creation stage is deletion and recreation because no application data exists yet. Record every selected option first.

1. Enable MFA on Hetzner and on the MajalOps password manager.
2. Create a dedicated Hetzner project for MajalOps platform resources.
3. Generate and register Mohamed's Ed25519 public key using `security-hardening.md`.
4. Create a Hetzner Cloud Firewall:
   - TCP 22 from Mohamed's known source CIDR where practical; otherwise all IPv4/IPv6 temporarily, protected by UFW rate limiting.
   - TCP 80 and 443 from all IPv4/IPv6.
   - ICMP/ICMPv6 for diagnostics and path MTU.
   - No inbound PostgreSQL, Docker, Odoo/Majal, Grafana, or exporter ports.
5. Decide the exact hostname (`platform.majalops.com` is the current placeholder).
6. Prepare the secret vault entries. Do not create real values in Git.

## 2. Create in Hetzner Cloud

Create—but do not deploy Majal to—the following:

- Name: `majalops-platform-01`
- Location: Nuremberg
- Image: Ubuntu 24.04 LTS
- Type: CPX22
- SSH key: Mohamed's registered Ed25519 public key
- Firewall: the reviewed platform firewall
- Backups: enable Hetzner backups as a convenience layer, not the only backup
- Labels: `owner=majalops`, `environment=platform`, `data=no-customer-production`

Record server ID, public IPv4/IPv6, creation time, image ID, firewall ID, and initial host fingerprint in `docs/server.md` only after Claude's current documentation work is complete, or in an external asset register meanwhile.

## 3. DNS

Before changing DNS, record current records and TTLs; rollback is restoring those records. Create the platform `A` record to the server IPv4 and `AAAA` only if IPv6 firewall/routing has been verified. Start at TTL 300, verify from at least two resolvers, then raise it after stability.

```bash
dig +short platform.majalops.com A
dig +short platform.majalops.com AAAA
```

Do not start Caddy until public DNS points to the correct server and inbound 80/443 work.

## 4. First login and infrastructure transfer

Verify the host fingerprint before acceptance:

```bash
ssh -i ~/.ssh/majalops_platform_ed25519 root@SERVER_IP
```

Create a Hetzner snapshot before hardening. Transfer only this reviewed infrastructure directory; do not place a GitHub token or a private repository credential on the server:

```bash
scp -r infrastructure root@SERVER_IP:/root/majalops-infrastructure-review
```

On the server:

```bash
find /root/majalops-infrastructure-review -type f -maxdepth 3 -print
chmod 0750 /root/majalops-infrastructure-review/scripts/*.sh
```

Compare checksums with the reviewed workstation copy before running anything.

## 5. Bootstrap without lockout

Risk: package, network, SSH, and kernel-setting changes. Rollback: Hetzner snapshot; for SSH, keep the original root session open and remove the SSH drop-in as documented.

Run stage 1:

```bash
cd /root/majalops-infrastructure-review
ADMIN_USER=majaladmin \
ADMIN_AUTHORIZED_KEYS_FILE=/root/.ssh/authorized_keys \
HOSTNAME_FQDN=majalops-platform-01 \
SERVER_TIMEZONE=UTC \
SWAP_SIZE_GB=2 \
bash scripts/bootstrap-server.sh
```

From a second local terminal:

```bash
ssh -i ~/.ssh/majalops_platform_ed25519 majaladmin@SERVER_IP
sudo -v
```

Only after it succeeds, run stage 2 from the existing session:

```bash
HARDEN_SSH=1 CONFIRM_ADMIN_SSH_TESTED=YES ADMIN_USER=majaladmin \
bash scripts/bootstrap-server.sh
```

Test another new login, confirm root login fails, then close the original session.

## 6. Firewall

Risk: an incorrect SSH port can lock out all remote access. Rollback: keep the current session open and run `sudo ufw disable`.

First inspect the dry run (it intentionally exits without changes):

```bash
sudo SSH_PORT=22 bash scripts/configure-firewall.sh
```

Then apply only after the port is confirmed:

```bash
sudo SSH_PORT=22 APPLY_FIREWALL=YES bash scripts/configure-firewall.sh
sudo ufw status verbose
```

Test SSH from a separate terminal again.

## 7. Docker

Risk: package installation and daemon restart. Rollback: use the pre-step snapshot or restore the timestamped `/etc/docker/daemon.json.backup.*`; do not delete `/var/lib/docker`.

```bash
sudo bash scripts/install-docker.sh
sudo systemctl is-enabled docker
sudo systemctl is-active docker
sudo docker version
sudo docker compose version
```

Do not add routine administrators to the `docker` group unless root-equivalent access is explicitly approved.

## 8. Prepare—but do not deploy—the runtime configuration

```bash
sudo install -d -m 0755 /opt/majalops/infrastructure/{docker,caddy,scripts}
sudo install -d -m 0700 /etc/majalops
sudo install -d -m 0700 /srv/majalops/backups
sudo install -m 0644 docker/compose.platform.example.yml /opt/majalops/infrastructure/docker/compose.platform.yml
sudo install -m 0644 caddy/Caddyfile.example /opt/majalops/infrastructure/caddy/Caddyfile
sudo install -m 0750 scripts/*.sh /opt/majalops/infrastructure/scripts/
sudo install -m 0600 docker/.env.example /etc/majalops/platform.env
sudoedit /etc/majalops/platform.env
```

Generate each secret independently and save it directly to the approved vault:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 32
```

Do not deploy until immutable image digests, exact domain, DNS, proxy settings, health behavior, and both checklists are reviewed.

## 9. Required evidence

Capture command output or screenshots for OS, hostname, time sync, upgrades, SSH effective settings, fail2ban, UFW, auditd, swap, disk, memory, Docker, Compose, DNS, TLS, containers, PostgreSQL, backup checksum, off-host backup, restore test, monitoring alerts, reboot recovery, and health endpoint. A command running without an error is not enough; the expected state must be visible.
