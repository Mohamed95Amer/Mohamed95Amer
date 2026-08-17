# Phase 2 owner actions

This is the shortest authenticated-owner path. Everything after these credentials is handled by `scripts/invoke-phase2.ps1`. Never paste a token into chat, Git, a screenshot, or a saved PowerShell profile.

## 1. Create a Hetzner project API token

- URL: <https://console.hetzner.cloud/projects>
- Open the project containing `majalops-platform-01`.
- Click **Security** → **API Tokens** → **Generate API Token**.
- Description: `MajalOps bootstrap`
- Permissions: **Read & Write**
- Copy the token once. Expected result: a token that can identify the existing server and manage its firewall, protection, labels, and Hetzner backups.

## 2. Create a scoped Cloudflare token

- URL: <https://dash.cloudflare.com/profile/api-tokens>
- Click **Create Token** → **Create Custom Token**.
- Token name: `MajalOps DNS automation`
- Permissions: **Zone / Zone / Read**, **Zone / DNS / Edit**, **Zone / Zone Settings / Edit**.
- Zone resources: **Include / Specific zone / majalops.com**.
- Client IP filtering: restrict to Mohamed's current public IP if it is stable; otherwise omit and rotate after provisioning.
- Click **Continue to summary** → **Create Token**.
- Expected result: a token limited to the MajalOps DNS zone and TLS-related zone settings.

## 3. Create a GitHub package pull token

- URL: <https://github.com/settings/tokens/new?scopes=read:packages&description=MajalOps%20server%20bootstrap>
- Expiration: `7 days`.
- Scope: only **read:packages**. Do not add `repo`, delete, or workflow scopes unless GitHub says private-package inheritance requires repository access; if so, use a fine-grained token limited to `Mohamed95Amer/Mohamed95Amer` with **Packages: Read**.
- Click **Generate token**.
- Expected result: a short-lived credential used once to let the server pull the first private image. GitHub Actions later uses a restricted deployment key.

## 4. Authenticate GitHub CLI once

First run the automated portable CLI installer, then authenticate it:

```powershell
$gh = powershell -ExecutionPolicy Bypass -File infrastructure\scripts\install-local-tools.ps1 | Select-Object -Last 1
& $gh auth login --hostname github.com --git-protocol https --web
```

Choose **Login with a web browser**, paste the one-time code at <https://github.com/login/device>, and authorize GitHub CLI. Expected result: `gh auth status` reports `Mohamed95Amer` as authenticated.

## 5. Run the secure one-command automation

Run from the repository root. The launcher requests each token using masked input, creates the semantic release, provisions the platform, and clears all token environment variables even if a step fails:

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure\scripts\start-phase2-secure.ps1 `
  -TlsEmail 'YOUR_CERTIFICATE_ALERT_EMAIL' `
  -EnableExternalHealth
```

Expected result: Hetzner controls, DNS, Docker stack, Caddy HTTPS, PostgreSQL, monitoring, systemd recovery, and GitHub deployment settings are configured; the command ends with `MajalOps Phase 2 provisioning completed`.

Delete/revoke the 7-day GitHub package token after the first successful release deployment. Store the Hetzner and Cloudflare tokens in the restricted `MajalOps Platform` 1Password or Bitwarden vault, then rotate them according to the security runbook.
