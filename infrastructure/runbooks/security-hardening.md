# SSH and host security hardening

This runbook is the security design for `majalops-platform-01`. Do not disable root SSH until a named non-root sudo account has been created, its public key installed, and a second terminal has successfully logged in.

## SSH key decision

Use Ed25519. It provides modern security with small keys, fast authentication, and broad support in Windows OpenSSH, Git Bash, macOS, Linux, Ubuntu 24.04, and Hetzner Cloud. RSA is only justified for a legacy client or regulated integration that cannot use Ed25519; if unavoidable, use RSA 4096 with SHA-2 signatures and plan its replacement. Do not use DSA, ECDSA with uncertain client implementations, or password authentication.

Create a separate key specifically for MajalOps administration. Do not reuse a personal GitHub key. The private key never goes to Hetzner or the server; only the `.pub` file does.

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
ssh-keygen -t ed25519 -a 100 -f "$env:USERPROFILE\.ssh\majalops_platform_ed25519" -C "mohamed@majalops-platform-01"
Get-Content "$env:USERPROFILE\.ssh\majalops_platform_ed25519.pub"
```

Enter a strong, unique passphrase when prompted. Files are stored at:

- Private: `C:\Users\YOUR_USER\.ssh\majalops_platform_ed25519`
- Public: `C:\Users\YOUR_USER\.ssh\majalops_platform_ed25519.pub`

Optionally load the key into the Windows OpenSSH agent from an elevated PowerShell session:

```powershell
Get-Service ssh-agent | Set-Service -StartupType Automatic
Start-Service ssh-agent
ssh-add "$env:USERPROFILE\.ssh\majalops_platform_ed25519"
```

### Windows Git Bash

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/majalops_platform_ed25519 -C "mohamed@majalops-platform-01"
cat ~/.ssh/majalops_platform_ed25519.pub
```

Files are stored under `/c/Users/YOUR_USER/.ssh/` (shown as `~/.ssh/` in Git Bash). The private file must be mode `0600`.

### macOS

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/majalops_platform_ed25519 -C "mohamed@majalops-platform-01"
chmod 600 ~/.ssh/majalops_platform_ed25519
cat ~/.ssh/majalops_platform_ed25519.pub
ssh-add --apple-use-keychain ~/.ssh/majalops_platform_ed25519
```

Files are stored in `/Users/YOUR_USER/.ssh/`.

### Linux

```bash
install -d -m 0700 ~/.ssh
ssh-keygen -t ed25519 -a 100 -f ~/.ssh/majalops_platform_ed25519 -C "mohamed@majalops-platform-01"
chmod 600 ~/.ssh/majalops_platform_ed25519
cat ~/.ssh/majalops_platform_ed25519.pub
ssh-add ~/.ssh/majalops_platform_ed25519
```

Files are stored in `/home/YOUR_USER/.ssh/`.

## Hetzner registration and first trust

1. In the Hetzner project, add the public key and name it `Mohamed - MajalOps platform - YYYY-MM`.
2. Select that key during server creation. Never paste the private key into the console.
3. On first connection, compare the host fingerprint with the fingerprint shown in the Hetzner console before accepting it.
4. Use `ssh-keygen -lf KEY.pub` locally to record the administrator key fingerprint in the access register.

Suggested client entry:

```sshconfig
Host majalops-platform
    HostName SERVER_IP
    User majaladmin
    Port 22
    IdentityFile ~/.ssh/majalops_platform_ed25519
    IdentitiesOnly yes
```

## Private-key storage and backup

Use 1Password Business as the preferred key/secrets vault because its SSH agent can use keys without exporting them. Bitwarden is an acceptable alternative if the team already governs it. Require MFA, recovery codes stored separately, named vault owners, and an access review at least quarterly.

Keep:

- The working encrypted private key on the administrator workstation.
- One encrypted vault copy in 1Password or Bitwarden.
- One offline encrypted recovery copy on removable media stored separately.

Never put a private key in Git, email, chat, a ticket, unencrypted cloud storage, a Docker image, or a server home-directory backup. A passphrase is mandatory and is not a substitute for access control.

## Multiple administrators

- Each human gets a named Linux account and their own Ed25519 key. Never share `majaladmin` long term.
- Put authorized administrators in `ssh-admins`; the hardened SSH configuration uses `AllowGroups ssh-admins`.
- Grant sudo only when required and review `/etc/sudoers.d/` separately.
- Store one public key per line in that user's `~/.ssh/authorized_keys`; annotate it with owner/device/date.
- CI/CD uses a separate machine identity, not a human key. It should have only deployment permissions and no unrestricted sudo.
- Maintain an access register with owner, account, public-key fingerprint, device, issue date, reviewer, and revocation date.

To add an administrator after hardening, keep the current session open and run:

```bash
sudo adduser --disabled-password --gecos "MajalOps administrator" USERNAME
sudo usermod -aG ssh-admins,sudo USERNAME
sudo install -d -m 0700 -o USERNAME -g USERNAME /home/USERNAME/.ssh
sudoedit /home/USERNAME/.ssh/authorized_keys
sudo chown USERNAME:USERNAME /home/USERNAME/.ssh/authorized_keys
sudo chmod 0600 /home/USERNAME/.ssh/authorized_keys
```

Test the new account in another terminal before closing the current session.

## Two-stage SSH-only configuration

Before every SSH change, create a Hetzner snapshot, keep the current session open, confirm console/rescue access, and save the current configuration:

```bash
sudo cp -a /etc/ssh /root/ssh-backup-$(date -u +%Y%m%dT%H%M%SZ)
```

Stage 1 creates the administrator but does not lock root:

```bash
sudo ADMIN_USER=majaladmin \
  ADMIN_AUTHORIZED_KEYS_FILE=/root/.ssh/authorized_keys \
  bash infrastructure/scripts/bootstrap-server.sh
```

Open a separate terminal and verify both login and sudo:

```bash
ssh majaladmin@SERVER_IP
sudo -v
sudo whoami
```

Only after that succeeds, apply key-only SSH and disable root login:

```bash
sudo HARDEN_SSH=1 CONFIRM_ADMIN_SSH_TESTED=YES ADMIN_USER=majaladmin \
  bash infrastructure/scripts/bootstrap-server.sh
```

The final state is `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, public keys enabled, forwarding disabled, and access restricted to `ssh-admins`. Validate with:

```bash
sudo sshd -t
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|allowgroups'
```

In a new terminal, verify the admin login works and both root and password login fail. Do not close the original terminal until all three checks are recorded.

Rollback while the original session remains open:

```bash
sudo rm -f /etc/ssh/sshd_config.d/60-majalops-hardening.conf
sudo sshd -t && sudo systemctl reload ssh
```

If locked out, use Hetzner console/rescue mode, mount the server filesystem, remove the drop-in, validate it, and reboot. Do not temporarily enable passwords.

## Rotation

Rotate human administrator keys annually, on device replacement, role change, or any suspicion of exposure:

1. Generate a new key with a new filename and passphrase.
2. Add the new public key alongside the old key.
3. Test the new key in a separate session and record its fingerprint.
4. Remove the old public-key line from the server and Hetzner project.
5. Confirm the old key fails, then delete its working copy and retire its vault entry according to policy.
6. Update the access register.

Never replace the only working key in one step.

## Compromise revocation

1. Use an unaffected administrator key or Hetzner console—not the suspected device.
2. Remove the compromised public-key line from every account and from the Hetzner project.
3. Remove the user from `ssh-admins` or lock the account: `sudo usermod --lock USERNAME`.
4. Kill active sessions: `sudo pkill -KILL -u USERNAME`.
5. Review `journalctl -u ssh`, audit logs, sudo logs, shell history, deployed keys, containers, and secret access since the last known-good time.
6. Rotate any secret accessible from that account and rebuild from a trusted image if compromise cannot be bounded.
7. Record the incident and evidence. Do not delete logs.

## Host controls supplied by the bootstrap

The bootstrap configures Ubuntu security updates, UTC time, locale, hostname, fail2ban, chrony, auditd rules, sysctl protections, a 2 GiB default swapfile, log rotation, and unattended upgrades. UFW is deliberately a separate confirmed step. Docker is deliberately a separate installer. Review each file before running it.

Docker-published ports can bypass assumptions made from UFW rules because Docker manages its own netfilter chains. The reviewed Compose file therefore publishes only Caddy's TCP 80/443 ports; PostgreSQL and Majal use `expose` on private Docker networks. The Hetzner Cloud Firewall is the independent outer control. Recheck public ports after every Compose change.

## Platform secret management

Prefer 1Password Business; use Bitwarden if it is already the governed company standard. Create a restricted `MajalOps Platform` vault with named owners, MFA, audit history, emergency recovery, and quarterly access review. The server receives only the secrets it needs in `/etc/majalops/platform.env`, owned by root with mode `0600`. Git contains only `docker/.env.example` placeholders.

Generate secrets independently so no two systems share a value:

```bash
openssl rand -base64 48   # PostgreSQL password
openssl rand -base64 48   # database-manager secret
openssl rand -base64 32   # Majal AI encryption/master key
```

Avoid commands that place real values in shell history. Capture generated values directly into the vault, then enter them with `sudoedit`. Do not print resolved Compose configuration because it can interpolate secrets.

Rotation expectations:

- Administrator SSH keys: annually, on device/role change, and immediately on suspicion.
- Registry, backup, DNS/API, and monitoring tokens: at least annually and on personnel/provider change.
- AI provider keys: per provider policy and immediately after exposure.
- PostgreSQL/application secrets: during a controlled maintenance window after a tested dual-value or coordinated restart plan.
- Encryption/master keys: only with an application-supported re-encryption plan; blind replacement can make stored ciphertext unrecoverable.

For every rotation, create rollback evidence, add/test the new credential, remove the old credential, prove the old one fails, update the vault and access register, and monitor authentication errors. Vault backups and emergency kits must be encrypted and stored separately from daily administrator devices. Never back up plaintext environment files to an unencrypted location.
